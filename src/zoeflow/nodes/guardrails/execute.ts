import type {
  ZoeNodeExecutionContext,
  ZoeNodeExecutionResult,
} from "@/zoeflow/engine/types";
import {
  ZoeAssistantVariant,
  type ZoeAssistantUsage,
} from "@/zoeflow/engine/types";
import {
  appendContextMessage,
  sortContextMessages,
} from "@/zoeflow/nodes/message/context";
import { toUserMessage } from "@/zoeflow/nodes/shared/llm";
import { getNodeTitle } from "@/zoeflow/nodes/shared/title";
import { buildCompletionMessages } from "@/zoeflow/openrouter/context";
import { estimateTokenCount } from "@/zoeflow/openrouter/tokenEstimate";
import type {
  OpenRouterCompletionRequest,
  OpenRouterCompletionResponse,
  OpenRouterMessage,
  OpenRouterTool,
  OpenRouterToolCall,
  OpenRouterToolChoice,
} from "@/zoeflow/openrouter/types";
import { ZoeLLMRole, type ZoeGuardrailsNodeData } from "@/zoeflow/types";

import baseInstructions from "@/content/nodes/guardrails/base.md";
import harmToOthersInstructions from "@/content/nodes/guardrails/harmToOthers.md";
import harmToSelfInstructions from "@/content/nodes/guardrails/harmToSelf.md";
import harmToSystemInstructions from "@/content/nodes/guardrails/harmToSystem.md";
import {
  GUARDRAILS_MODEL,
  GUARDRAILS_TEMPERATURE,
} from "@/zoeflow/nodes/guardrails/config";

const GUARDRAILS_TOOLS: OpenRouterTool[] = [
  {
    type: "function",
    function: {
      name: "set_results",
      description: "Set the guardrails evaluation result.",
      parameters: {
        type: "object",
        properties: {
          pass: {
            type: "boolean",
            description:
              "True if the input passes guardrails, false otherwise.",
          },
          reason: {
            type: "string",
            description:
              "If pass is false, a short reason explaining why the input is blocked.",
          },
        },
        required: ["pass"],
        additionalProperties: false,
      },
    },
  },
];

const GUARDRAILS_TOOL_CHOICE: OpenRouterToolChoice = {
  type: "function",
  function: { name: "set_results" },
};

/**
 * Execute the Guardrails node.
 *
 * @param context - Execution context for the node.
 * @param data - Guardrails node data.
 */
export async function executeGuardrailsNode(
  context: ZoeNodeExecutionContext,
  data: ZoeGuardrailsNodeData,
): Promise<ZoeNodeExecutionResult> {
  const assistantName = getNodeTitle(context.node);
  const messageId = context.runtime.callbacks.onAssistantStart({
    name: assistantName,
    variant: ZoeAssistantVariant.Internal,
    nodeId: context.node.id,
  });

  const userPrompt = toUserMessage(context.state.payload);
  const completionContextMessages = sortContextMessages(
    context.contextMessages,
  );

  const payload: OpenRouterCompletionRequest = {
    model: GUARDRAILS_MODEL,
    stream: false,
    messages: buildCompletionMessages({
      systemPrompt: buildGuardrailsSystemPrompt(data),
      contextMessages: completionContextMessages,
      userMessage: userPrompt,
      conversation: context.state.conversation,
      includeConversation: false,
    }),
    tools: GUARDRAILS_TOOLS,
    tool_choice: GUARDRAILS_TOOL_CHOICE,
  };

  payload.temperature = GUARDRAILS_TEMPERATURE;

  const responseData = await fetchGuardrailsCompletion(context, payload);
  const message = responseData.choices?.[0]?.message;
  const toolResult = parseGuardrailsToolResultFromMessage(message);
  const decision = toolResult?.pass ?? false;
  const assistantReason = (message?.content ?? "").trim();
  const toolReason = toolResult?.reason?.trim() || "";
  const reasonForPayload =
    assistantReason || toolReason || "Request blocked by guardrails.";
  const reasonForContext = assistantReason || toolReason;

  const usage = estimateGuardrailsUsage({
    request: payload,
    responseMessage: message,
  });
  context.runtime.callbacks.onAssistantUsage?.(messageId, usage);

  context.runtime.callbacks.onTrace(
    `Guardrails input: ${truncateForTrace(userPrompt, 160)}`,
  );
  context.runtime.callbacks.onTrace(
    `Guardrails toolResult: ${stringifyForTrace(toolResult)}`,
  );
  context.runtime.callbacks.onTrace("Guardrails decision: " + decision);

  if (toolResult === null) {
    context.runtime.callbacks.onTrace(
      `Guardrails defaulted to fail (${context.node.id}).`,
    );
  }

  context.runtime.callbacks.onTrace(
    `Guardrails final decision: ${decision ? "pass" : "fail"} (${context.node.id}).`,
  );

  if (decision) {
    context.runtime.callbacks.onAssistantUpdate(messageId, "Pass");
    if (assistantReason.length > 0) {
      context.runtime.callbacks.onTrace(
        `Guardrails returned unexpected content on pass (${context.node.id}): ${truncateForTrace(assistantReason, 160)}`,
      );
    }
  } else {
    context.state.payload = reasonForPayload;
    context.runtime.callbacks.onAssistantUpdate(
      messageId,
      reasonForContext.length > 0
        ? `Fail: ${reasonForContext}`
        : `Fail: ${reasonForPayload}`,
    );
    if (reasonForContext.length > 0) {
      context.state.contextMessages = appendContextMessage(
        context.state.contextMessages,
        {
          role: ZoeLLMRole.System,
          content: reasonForContext,
          priority: -10,
          sourceNodeId: context.node.id,
        },
      );
    }
  }

  return { nextPort: decision ? "pass" : "fail" };
}

/**
 * Build the guardrails system prompt based on enabled modules.
 *
 * @param data - Guardrails node data.
 */
function buildGuardrailsSystemPrompt(data: ZoeGuardrailsNodeData): string {
  const enableHarmToOthers = resolveGuardrailsToggle(
    data.guardrailsHarmToOthers,
    true,
  );
  const enableHarmToSelf = resolveGuardrailsToggle(
    data.guardrailsHarmToSelf,
    true,
  );
  const enableHarmToSystem = resolveGuardrailsToggle(
    data.guardrailsHarmToSystem,
    true,
  );

  const sections = [baseInstructions];
  if (enableHarmToOthers) sections.push(harmToOthersInstructions);
  if (enableHarmToSelf) sections.push(harmToSelfInstructions);
  if (enableHarmToSystem) sections.push(harmToSystemInstructions);

  const prompt = sections
    .map((section) => section.trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();

  return prompt.length > 0 ? `${prompt}\n` : "";
}

/**
 * Normalize persisted guardrails toggles (older graphs might omit the new fields).
 *
 * @param value - Raw value.
 * @param fallback - Default value when the stored value is missing/invalid.
 */
function resolveGuardrailsToggle(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/**
 * Estimate guardrails usage (prompt and completion tokens) for UI cost reporting.
 *
 * @param input - Guardrails request/response snapshot.
 */
function estimateGuardrailsUsage(input: {
  request: OpenRouterCompletionRequest;
  responseMessage?: OpenRouterMessage;
}): ZoeAssistantUsage {
  const promptTokens = input.request.messages.reduce((sum, entry) => {
    const content = entry.content ?? "";
    return sum + estimateTokenCount(content);
  }, 0);

  const completionText = buildCompletionUsageText(input.responseMessage);
  const completionTokens = completionText
    ? estimateTokenCount(completionText)
    : 0;
  const totalTokens = promptTokens + completionTokens;

  return {
    promptTokens,
    completionTokens,
    totalTokens,
  };
}

/**
 * Build a string snapshot for estimating completion-side tokens.
 *
 * @param message - OpenRouter assistant message.
 */
function buildCompletionUsageText(message?: OpenRouterMessage): string {
  if (!message) return "";
  const parts: string[] = [];

  if (message.content) {
    const trimmed = message.content.trim();
    if (trimmed) parts.push(trimmed);
  }

  if (message.tool_calls && message.tool_calls.length > 0) {
    message.tool_calls.forEach((toolCall) => {
      const name = toolCall.function?.name ?? "";
      const args = toolCall.function?.arguments ?? "";
      parts.push([name, args].filter(Boolean).join(" "));
    });
  }

  if (message.function_call) {
    const name = message.function_call.name ?? "";
    const args = message.function_call.arguments ?? "";
    parts.push([name, args].filter(Boolean).join(" "));
  }

  return parts.join("\n").trim();
}

/**
 * Perform the guardrails completion request with a compatibility retry.
 *
 * Some providers/models reject a forced `tool_choice` object. In that case, retry once with
 * `tool_choice: "auto"` while keeping tools enabled.
 *
 * @param context - Execution context for the node.
 * @param payload - OpenRouter completion payload.
 */
async function fetchGuardrailsCompletion(
  context: ZoeNodeExecutionContext,
  payload: OpenRouterCompletionRequest,
): Promise<OpenRouterCompletionResponse> {
  const attempt = async (attemptPayload: OpenRouterCompletionRequest) => {
    const response = await fetch(context.runtime.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(attemptPayload),
      signal: context.runtime.signal,
    });

    if (response.ok) {
      return (await response.json()) as OpenRouterCompletionResponse;
    }

    const body = await response.text();
    return { body, ok: false as const };
  };

  const first = await attempt(payload);
  if (!("ok" in first)) return first;

  const forcedToolChoice =
    payload.tool_choice &&
    typeof payload.tool_choice === "object" &&
    "type" in payload.tool_choice;
  if (!forcedToolChoice || !shouldRetryWithoutForcedToolChoice(first.body)) {
    throw new Error(`Guardrails failed (${context.node.id}): ${first.body}`);
  }

  context.runtime.callbacks.onTrace(
    `Guardrails retrying without forced tool choice (${context.node.id}).`,
  );

  const second = await attempt({ ...payload, tool_choice: "auto" });
  if (!("ok" in second)) return second;

  throw new Error(`Guardrails failed (${context.node.id}): ${second.body}`);
}

/**
 * Detect whether an error body suggests `tool_choice` is unsupported.
 *
 * @param body - Raw response body.
 */
function shouldRetryWithoutForcedToolChoice(body: string) {
  const normalized = body.toLowerCase();
  if (normalized.includes("tool_choice") || normalized.includes("tool choice"))
    return true;
  if (
    normalized.includes("tools") &&
    normalized.includes("not") &&
    normalized.includes("support")
  ) {
    return true;
  }
  return false;
}

/**
 * Extract a guardrails tool result from a guardrails response message (tool_calls or legacy function_call).
 *
 * @param message - Assistant message from the response.
 */
function parseGuardrailsToolResultFromMessage(
  message?: OpenRouterMessage,
): GuardrailsToolResult | null {
  const toolCallsResult = parseGuardrailsToolResult(message?.tool_calls);
  if (toolCallsResult !== null) return toolCallsResult;

  if (message?.function_call?.name !== "set_results") return null;
  const parsed = parseToolCallArguments(message.function_call.arguments);
  return extractGuardrailsToolResult(parsed);
}

/**
 * Safely parse tool call arguments.
 *
 * @param raw - Raw tool call arguments value.
 */
function parseToolCallArguments(raw?: unknown) {
  if (!raw) return null;
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

/**
 * Guardrails tool result parsed from a tool call.
 */
type GuardrailsToolResult = {
  pass: boolean;
  reason?: string | null;
};

/**
 * Extract a tool result from a tool call list.
 *
 * @param toolCalls - Tool calls from the assistant response.
 */
function parseGuardrailsToolResult(
  toolCalls?: OpenRouterToolCall[],
): GuardrailsToolResult | null {
  if (!toolCalls || toolCalls.length === 0) return null;

  for (const toolCall of toolCalls) {
    if (toolCall.type !== "function") continue;
    if (toolCall.function?.name !== "set_results") continue;
    const parsed = parseToolCallArguments(toolCall.function.arguments);
    const extracted = extractGuardrailsToolResult(parsed);
    if (extracted !== null) return extracted;
  }

  return null;
}

/**
 * Extract a tool result from tool call arguments.
 *
 * @param input - Parsed tool call arguments.
 */
function extractGuardrailsToolResult(
  input: unknown,
): GuardrailsToolResult | null {
  if (!input || typeof input !== "object") return null;
  if (!("pass" in input)) return null;

  const pass = (input as { pass?: unknown }).pass;
  if (typeof pass !== "boolean") return null;

  const reasonRaw =
    "reason" in input ? (input as { reason?: unknown }).reason : undefined;
  const reason =
    typeof reasonRaw === "string"
      ? reasonRaw.trim()
      : reasonRaw === null || reasonRaw === undefined
        ? null
        : null;

  return { pass, reason };
}

/**
 * Truncate a string for trace output.
 *
 * @param value - Input string value.
 * @param maxLength - Max length for the output.
 */
function truncateForTrace(value: string, maxLength: number) {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength)}…`;
}

/**
 * Safely stringify values for trace output.
 *
 * @param value - Value to serialize.
 */
function stringifyForTrace(value: unknown) {
  if (value === null || value === undefined) return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
