import { invalidateEvaluationCache } from "@/zoeflow/engine/evaluator";
import {
  ZoeAssistantVariant,
  type ZoeNodeExecutionContext,
} from "@/zoeflow/engine/types";
import { collectCoinFlipInputContributions } from "@/zoeflow/nodes/coinFlip/collection";
import { collectDiceRollInputContributions } from "@/zoeflow/nodes/diceRoll/collection";
import {
  getNestedValue,
  setNestedValue,
} from "@/zoeflow/nodes/globalState/utils";
import {
  collectMessageInputContributions,
  mergeContextMessages,
  sortContextMessages,
} from "@/zoeflow/nodes/message/context";
import { collectRagInputContributions } from "@/zoeflow/nodes/rag/collection";
import { collectReadDocumentInputContributions } from "@/zoeflow/nodes/readDocument/collection";
import { toUserMessage } from "@/zoeflow/nodes/shared/llm";
import { getNodeTitle } from "@/zoeflow/nodes/shared/title";
import { collectToolInputContributions } from "@/zoeflow/nodes/tool/collection";
import type { ZoeDeveloperToolDefinition } from "@/zoeflow/nodes/tool/developer";
import { getDeveloperToolDefinition } from "@/zoeflow/nodes/tool/developer";
import { buildCompletionMessages } from "@/zoeflow/openrouter/context";
import { readOpenRouterStream } from "@/zoeflow/openrouter/stream";
import type {
  OpenRouterCompletionRequest,
  OpenRouterCompletionResponse,
  OpenRouterTool,
  OpenRouterToolCall,
  OpenRouterToolChoice,
  OpenRouterUsage,
} from "@/zoeflow/openrouter/types";
import {
  ZoeLLMRole,
  ZoeNodeID,
  type ZoeCompletionNodeData,
} from "@/zoeflow/types";

type CompletionToolsParseResult = {
  tools: OpenRouterTool[] | null;
  toolChoice: OpenRouterToolChoice | null;
  error: string | null;
};

type CompletionTraceSnapshotMessage = {
  role: string;
  toolCallId?: string;
  toolCalls?: Array<{ id?: string; name?: string }>;
  content: string;
};

/**
 * Execute the Completion node.
 *
 * @param context - Execution context for the node.
 * @param data - Completion node data.
 */
export async function executeCompletionNode(
  context: ZoeNodeExecutionContext,
  data: ZoeCompletionNodeData,
) {
  const assistantName = getNodeTitle(context.node);
  const userPrompt = toUserMessage(context.state.payload);
  const temperature = Number(data.temperature);

  /**
   * Resolve the latest completion inputs after vars or edges change.
   *
   * @param source - Trace label for the input refresh.
   */
  const resolveCompletionInputs = (source: string) => {
    const messageInputs = collectMessageInputContributions({
      nodeId: context.node.id,
      evaluationContext: context.evaluationContext,
    });

    const ragNodesResult = collectRagInputContributions({
      nodeId: context.node.id,
      evaluationContext: context.evaluationContext,
    });
    if (ragNodesResult.error) {
      throw new Error(
        `Completion RAG nodes failed (${context.node.id}): ${ragNodesResult.error}`,
      );
    }

    const toolNodesResult = collectToolInputContributions({
      nodeId: context.node.id,
      evaluationContext: context.evaluationContext,
    });
    if (toolNodesResult.error) {
      throw new Error(
        `Completion tool nodes failed (${context.node.id}): ${toolNodesResult.error}`,
      );
    }

    const coinFlipNodesResult = collectCoinFlipInputContributions({
      nodeId: context.node.id,
      evaluationContext: context.evaluationContext,
    });
    if (coinFlipNodesResult.error) {
      throw new Error(
        `Completion coin flip nodes failed (${context.node.id}): ${coinFlipNodesResult.error}`,
      );
    }

    const diceRollNodesResult = collectDiceRollInputContributions({
      nodeId: context.node.id,
      evaluationContext: context.evaluationContext,
    });
    if (diceRollNodesResult.error) {
      throw new Error(
        `Completion dice roll nodes failed (${context.node.id}): ${diceRollNodesResult.error}`,
      );
    }

    const readDocumentNodesResult = collectReadDocumentInputContributions({
      nodeId: context.node.id,
      evaluationContext: context.evaluationContext,
    });
    if (readDocumentNodesResult.error) {
      throw new Error(
        `Completion read document nodes failed (${context.node.id}): ${readDocumentNodesResult.error}`,
      );
    }

    const completionContextMessages = sortContextMessages(
      mergeContextMessages(
        mergeContextMessages(
          context.state.contextMessages,
          messageInputs.contextMessages,
        ),
        ragNodesResult.contextMessages,
      ),
    );

    const developerToolsByName = new Map<
      string,
      {
        nodeId: string;
        definition: ZoeDeveloperToolDefinition;
        data:
          | (typeof toolNodesResult.contributions)[number]["data"]
          | (typeof ragNodesResult.contributions)[number]["data"]
          | (typeof coinFlipNodesResult.contributions)[number]["data"]
          | (typeof diceRollNodesResult.contributions)[number]["data"]
          | (typeof readDocumentNodesResult.contributions)[number]["data"];
      }
    >();
    for (const contribution of toolNodesResult.contributions) {
      const toolName = contribution.definition.openRouterTool.function.name;
      if (!developerToolsByName.has(toolName)) {
        developerToolsByName.set(toolName, {
          nodeId: contribution.nodeId,
          definition: contribution.definition,
          data: contribution.data,
        });
      }
    }

    if (ragNodesResult.contributions.length > 0) {
      const ragDefinition = getDeveloperToolDefinition(ZoeNodeID.Rag);
      const toolName = ragDefinition.openRouterTool.function.name;
      const ragNode = ragNodesResult.contributions[0];

      if (!developerToolsByName.has(toolName)) {
        developerToolsByName.set(toolName, {
          nodeId: ragNode.nodeId,
          definition: ragDefinition,
          data: ragNode.data,
        });
      }
    }

    for (const contribution of coinFlipNodesResult.contributions) {
      const coinFlipDefinition = getDeveloperToolDefinition(ZoeNodeID.CoinFlip);
      const toolName = coinFlipDefinition.openRouterTool.function.name;

      if (!developerToolsByName.has(toolName)) {
        developerToolsByName.set(toolName, {
          nodeId: contribution.nodeId,
          definition: coinFlipDefinition,
          data: contribution.data,
        });
      }
    }

    for (const contribution of diceRollNodesResult.contributions) {
      const diceRollDefinition = getDeveloperToolDefinition(ZoeNodeID.DiceRoll);
      const toolName = diceRollDefinition.openRouterTool.function.name;

      if (!developerToolsByName.has(toolName)) {
        developerToolsByName.set(toolName, {
          nodeId: contribution.nodeId,
          definition: diceRollDefinition,
          data: contribution.data,
        });
      }
    }

    for (const contribution of readDocumentNodesResult.contributions) {
      const readDocumentDefinition = getDeveloperToolDefinition(
        ZoeNodeID.ReadDocument,
      );
      const toolName = readDocumentDefinition.openRouterTool.function.name;

      if (!developerToolsByName.has(toolName)) {
        developerToolsByName.set(toolName, {
          nodeId: contribution.nodeId,
          definition: readDocumentDefinition,
          data: contribution.data,
        });
      }
    }

    const enableTools =
      Boolean(data.useTools) ||
      toolNodesResult.tools.length > 0 ||
      ragNodesResult.tools.length > 0 ||
      coinFlipNodesResult.tools.length > 0 ||
      diceRollNodesResult.tools.length > 0 ||
      readDocumentNodesResult.tools.length > 0;
    const toolsResult = parseCompletionTools({
      useTools: enableTools,
      toolsJson: data.toolsJson,
      toolChoiceJson: data.toolChoiceJson,
    });
    if (toolsResult.error) {
      throw new Error(
        `Completion tools config failed (${context.node.id}): ${toolsResult.error}`,
      );
    }

    const mergedTools = enableTools
      ? mergeTools(
          mergeTools(
            mergeTools(
              mergeTools(
                mergeTools(ragNodesResult.tools, toolNodesResult.tools),
                coinFlipNodesResult.tools,
              ),
              diceRollNodesResult.tools,
            ),
            readDocumentNodesResult.tools,
          ),
          toolsResult.tools ?? [],
        )
      : [];

    return {
      completionContextMessages,
      developerToolsByName,
      enableTools,
      mergedTools,
      toolsResult,
      source,
    };
  };

  const initialInputs = resolveCompletionInputs("initial");

  const buildMessages = (
    overrideContextMessages?: typeof initialInputs.completionContextMessages,
  ) =>
    buildCompletionMessages({
      systemPrompt: data.systemPrompt,
      contextMessages:
        overrideContextMessages ?? initialInputs.completionContextMessages,
      userMessage: userPrompt,
      conversation: context.state.conversation,
      includeConversation: Boolean(data.includeConversation),
    });

  /**
   * Extract usage from a response and report it via callbacks.
   * This is shared between tool and non-tool execution paths.
   *
   * @param usage - Usage data from API response (can be from streaming or non-streaming).
   * @param messageId - Message ID to report usage for.
   */
  const reportUsage = (
    usage: OpenRouterUsage | undefined,
    messageId: string,
  ): void => {
    if (!usage) return;

    const usageData = {
      promptTokens: usage.prompt_tokens ?? 0,
      completionTokens: usage.completion_tokens ?? 0,
      totalTokens: usage.total_tokens ?? 0,
    };
    if (context.runtime.callbacks.onAssistantUsage) {
      context.runtime.callbacks.onAssistantUsage(messageId, usageData);
    }
  };

  if (!initialInputs.enableTools) {
    const requestMessages = buildMessages(
      initialInputs.completionContextMessages,
    );
    traceCompletionRequest(context, data, {
      label: "streaming",
      requestMessages,
    });

    const messageId = context.runtime.callbacks.onAssistantStart({
      name: assistantName,
      variant: ZoeAssistantVariant.Standard,
      nodeId: context.node.id,
    });

    const payload: OpenRouterCompletionRequest = {
      model: data.model,
      stream: true,
      messages: requestMessages,
    };
    if (Number.isFinite(temperature)) {
      payload.temperature = temperature;
    }

    const response = await fetch(context.runtime.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: context.runtime.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Completion failed (${context.node.id}): ${body}`);
    }

    let accumulated = "";
    let usage: OpenRouterUsage | undefined;
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("text/event-stream")) {
      const streamResult = await readOpenRouterStream(response, (delta) => {
        accumulated += delta;
        context.runtime.callbacks.onAssistantUpdate(messageId, accumulated);
      });
      if (!accumulated) {
        accumulated = streamResult.text;
      }
      usage = streamResult.usage;
    } else {
      const responseData =
        (await response.json()) as OpenRouterCompletionResponse;
      accumulated = responseData.choices?.[0]?.message?.content?.trim() ?? "";
      context.runtime.callbacks.onAssistantUpdate(
        messageId,
        accumulated || "Completion returned no content.",
      );
      usage = responseData.usage;
    }

    if (!accumulated.trim()) {
      accumulated = "Completion returned no content.";
      context.runtime.callbacks.onAssistantUpdate(messageId, accumulated);
    }

    reportUsage(usage, messageId);

    context.state.payload = accumulated;
    context.state.conversation = [
      ...context.state.conversation,
      { role: ZoeLLMRole.User, content: userPrompt },
      { role: ZoeLLMRole.Assistant, content: accumulated },
    ];
    return;
  }

  // Iterative tool-calling loop: continue until no tool calls or max iterations
  const MAX_TOOL_ITERATIONS = 10;
  let iteration = 0;
  let accumulatedContent = "";
  let finalMessageId: string | null = null;
  const currentConversation = [...context.state.conversation];

  // Add user message to conversation at the start
  currentConversation.push({ role: ZoeLLMRole.User, content: userPrompt });

  while (iteration < MAX_TOOL_ITERATIONS) {
    const inputs = resolveCompletionInputs(`iteration ${iteration + 1}`);
    const requestMessages = buildCompletionMessages({
      systemPrompt: data.systemPrompt,
      contextMessages: inputs.completionContextMessages,
      userMessage: userPrompt,
      conversation: currentConversation,
      includeConversation: true,
      includeUserMessage: false,
    });

    traceCompletionRequest(context, data, {
      label: `tool-aware iteration ${iteration + 1}`,
      requestMessages,
    });

    const payload: OpenRouterCompletionRequest = {
      model: data.model,
      stream: true,
      messages: requestMessages,
    };
    if (Number.isFinite(temperature)) {
      payload.temperature = temperature;
    }
    if (inputs.mergedTools.length > 0) {
      payload.tools = inputs.mergedTools;
    }
    if (iteration === 0 && inputs.toolsResult.toolChoice) {
      payload.tool_choice = inputs.toolsResult.toolChoice;
    }

    const response = await fetch(context.runtime.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: context.runtime.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Completion failed (${context.node.id}): ${body}`);
    }

    let content = "";
    let usage: OpenRouterUsage | undefined;
    let rawToolCalls: OpenRouterToolCall[] = [];
    const contentType = response.headers.get("content-type") ?? "";

    if (contentType.includes("text/event-stream")) {
      const streamResult = await readOpenRouterStream(response, (delta) => {
        content += delta;
        // Update UI if we have a message ID (create one if needed)
        if (!finalMessageId) {
          finalMessageId = context.runtime.callbacks.onAssistantStart({
            name: assistantName,
            variant: ZoeAssistantVariant.Standard,
            nodeId: context.node.id,
          });
        }
        accumulatedContent = content.trim();
        context.runtime.callbacks.onAssistantUpdate(
          finalMessageId,
          accumulatedContent,
        );
      });
      content = streamResult.text.trim();
      usage = streamResult.usage;
      rawToolCalls = streamResult.toolCalls ?? [];
    } else {
      const responseData =
        (await response.json()) as OpenRouterCompletionResponse;
      const message = responseData.choices?.[0]?.message ?? {};
      content = (message.content ?? "").trim();
      usage = responseData.usage;
      rawToolCalls = message.tool_calls ?? [];

      // Update UI for non-streaming responses
      if (content) {
        if (!finalMessageId) {
          finalMessageId = context.runtime.callbacks.onAssistantStart({
            name: assistantName,
            variant: ZoeAssistantVariant.Standard,
            nodeId: context.node.id,
          });
        }
        accumulatedContent = content;
        context.runtime.callbacks.onAssistantUpdate(finalMessageId, content);
      }
    }

    const toolCalls = rawToolCalls.map((call, index) => ({
      ...call,
      id: call.id ?? `${context.node.id}-toolcall-${iteration}-${index + 1}`,
    }));

    // If there's content, accumulate it and show to user
    if (content) {
      if (!finalMessageId) {
        finalMessageId = context.runtime.callbacks.onAssistantStart({
          name: assistantName,
          variant: ZoeAssistantVariant.Standard,
          nodeId: context.node.id,
        });
      }
      accumulatedContent = content;
      context.runtime.callbacks.onAssistantUpdate(finalMessageId, content);
    }

    // Report usage (internal for tool calls, standard for final content)
    if (usage) {
      const usageMessageId =
        toolCalls.length > 0
          ? context.runtime.callbacks.onAssistantStart({
              name: assistantName,
              variant: ZoeAssistantVariant.Internal,
              nodeId: context.node.id,
            })
          : (finalMessageId ??
            context.runtime.callbacks.onAssistantStart({
              name: assistantName,
              variant: ZoeAssistantVariant.Standard,
              nodeId: context.node.id,
            }));
      reportUsage(usage, usageMessageId);
    }

    // Add assistant message to conversation
    currentConversation.push({
      role: ZoeLLMRole.Assistant,
      content: content || "",
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    });

    // If no tool calls, we're done!
    if (toolCalls.length === 0) {
      break;
    }

    // Execute tools and add results to conversation
    const toolCallsSummary = toolCalls
      .map((call) => call.function?.name ?? "unknown")
      .join(", ");
    context.runtime.callbacks.onTrace(
      `Completion requested tool(s): ${toolCallsSummary}`,
    );

    const toolResultEntries: Array<{
      role: ZoeLLMRole.Tool;
      content: string;
      toolCallId: string;
    }> = [];

    for (const [index, call] of toolCalls.entries()) {
      const toolName = call.function?.name ?? "";
      const tool = inputs.developerToolsByName.get(toolName) ?? null;
      if (!tool) {
        throw new Error(
          `Tool call "${toolName}" cannot be executed (${context.node.id}): no matching developer tool is connected.`,
        );
      }

      const parsedArguments = parseToolCallArguments(call.function?.arguments);

      // Handle Global State tool calls specially - modify state.vars directly
      let result;
      if (toolName === "global_state") {
        const args = parsedArguments as {
          action?: string;
          path?: string;
          value?: unknown;
        };

        if (
          !args ||
          typeof args.action !== "string" ||
          typeof args.path !== "string"
        ) {
          result = {
            message: "Error: 'action' and 'path' are required parameters.",
            value: { error: "Missing required parameters" },
          };
        } else {
          const { action, path, value } = args;
          if (action === "set") {
            try {
              setNestedValue(context.state.vars, path, value);
              invalidateEvaluationCache(context.evaluationContext);
              result = {
                message: `Set variable "${path}" successfully.`,
                value: { success: true, path, value },
              };
            } catch (error) {
              const message =
                error instanceof Error ? error.message : "Unknown error";
              result = {
                message: `Error setting variable "${path}": ${message}`,
                value: { error: message, path },
              };
            }
          } else if (action === "get") {
            try {
              const retrievedValue = getNestedValue(context.state.vars, path);
              result = {
                message: `Retrieved variable "${path}".`,
                value: { success: true, path, value: retrievedValue },
              };
            } catch (error) {
              const message =
                error instanceof Error ? error.message : "Unknown error";
              result = {
                message: `Error getting variable "${path}": ${message}`,
                value: { error: message, path },
              };
            }
          } else {
            result = {
              message: `Error: Invalid action "${action}". Must be 'set' or 'get'.`,
              value: { error: "Invalid action", action },
            };
          }
        }
      } else {
        // Normal tool execution
        result = await tool.definition.execute({
          data: tool.data,
          toolCall: {
            name: toolName,
            arguments: parsedArguments,
          },
        });
      }

      // For RAG search, use the formatted message for chat display
      // For other tools, use JSON for structured data
      const toolContent =
        toolName === "rag_search" && result.message
          ? result.message
          : JSON.stringify(result.value ?? { message: result.message });
      const toolCallId =
        call.id ?? `${context.node.id}-${toolName}-${iteration}-${index + 1}`;

      // Enhanced trace for read_document with arguments and result
      if (toolName === "read_document") {
        const readDocValue = result.value as {
          docId?: string;
          version?: string;
          sourceUri?: string;
          content?: string;
          section?: string | null;
        };

        const traceLines: string[] = [
          `Read document (${tool.nodeId}) executed`,
        ];

        // Show all arguments the LLM used to call the tool
        if (parsedArguments) {
          const args = parsedArguments as {
            doc_id?: unknown;
            source_uri?: unknown;
            section?: unknown;
            version?: unknown;
            start_line?: unknown;
            end_line?: unknown;
          };

          traceLines.push("Arguments:");
          if (args.doc_id) {
            traceLines.push(`  doc_id: ${args.doc_id}`);
          }
          if (args.source_uri) {
            traceLines.push(`  source_uri: ${args.source_uri}`);
          }
          if (args.section) {
            traceLines.push(`  section: ${args.section}`);
          }
          if (args.version) {
            traceLines.push(`  version: ${args.version}`);
          }
          if (args.start_line !== undefined) {
            traceLines.push(`  start_line: ${args.start_line}`);
          }
          if (args.end_line !== undefined) {
            traceLines.push(`  end_line: ${args.end_line}`);
          }
        }

        // Show the document that was read
        if (readDocValue?.sourceUri) {
          traceLines.push(`Document: ${readDocValue.sourceUri}`);
          if (readDocValue.section) {
            traceLines.push(`Section: ${readDocValue.section}`);
          }
          if (readDocValue.version) {
            traceLines.push(`Version: ${readDocValue.version}`);
          }
        }

        context.runtime.callbacks.onTrace(traceLines.join("\n"));
      }

      // Enhanced trace for RAG search with detailed results
      if (toolName === "rag_search" && result.value) {
        const ragValue = result.value as {
          queries?: string[];
          results?: Array<{
            id: string;
            text: string;
            score: number;
            rank?: number;
            citation?: {
              source_uri: string;
              version: string;
              heading_path: string;
              doc_id: string;
              start_line?: number;
              end_line?: number;
              start_char?: number;
              end_char?: number;
              chunk_index?: number;
              content_type?: string;
            };
          }>;
        };

        const results = ragValue.results ?? [];
        if (results.length > 0) {
          const topResults = results.slice(0, 5); // Show top 5
          const traceLines: string[] = [
            `RAG search (${tool.nodeId}) executed: ${results.length} result(s)`,
          ];

          // Reverse order: least to most relevant
          const reversedResults = [...topResults].reverse();

          reversedResults.forEach((result) => {
            const score = (result.score * 100).toFixed(1);
            const citation = result.citation;

            // Decode HTML entities in heading_path
            const headingPath = citation?.heading_path
              ? decodeHtmlEntities(citation.heading_path)
              : "";

            // Show all citation data that the LLM receives (same data, formatted)
            traceLines.push(`${score}%`);
            if (citation?.source_uri) {
              traceLines.push(citation.source_uri);
            }
            if (headingPath) {
              traceLines.push(headingPath);
            }
            if (
              citation?.start_line !== undefined &&
              citation?.end_line !== undefined
            ) {
              traceLines.push(
                `lines ${citation.start_line + 1}-${citation.end_line + 1}`,
              );
            }
            if (citation?.doc_id) {
              traceLines.push(`doc_id: ${citation.doc_id}`);
            }
            if (citation?.version) {
              traceLines.push(`version: ${citation.version}`);
            }
            if (citation?.chunk_index !== undefined) {
              traceLines.push(`chunk_index: ${citation.chunk_index}`);
            }
            if (citation?.content_type) {
              traceLines.push(`content_type: ${citation.content_type}`);
            }
            if (
              citation?.start_char !== undefined &&
              citation?.end_char !== undefined
            ) {
              traceLines.push(
                `chars ${citation.start_char}-${citation.end_char}`,
              );
            }
            traceLines.push(result.text);
            traceLines.push(""); // Empty line between results
          });

          if (results.length > 5) {
            traceLines.push(`... and ${results.length - 5} more result(s)`);
          }

          context.runtime.callbacks.onTrace(traceLines.join("\n"));
        } else {
          context.runtime.callbacks.onTrace(
            `Tool ${tool.definition.label} (${tool.nodeId}) executed: ${result.message}`,
          );
        }
      } else {
        context.runtime.callbacks.onTrace(
          `Tool ${tool.definition.label} (${tool.nodeId}) executed: ${result.message}`,
        );
      }

      toolResultEntries.push({
        role: ZoeLLMRole.Tool,
        content: toolContent,
        toolCallId,
      });
    }

    // Add tool results to conversation
    currentConversation.push(
      ...toolResultEntries.map((entry) => ({
        role: ZoeLLMRole.Tool,
        content: entry.content,
        toolCallId: entry.toolCallId,
      })),
    );

    iteration++;
  }

  if (iteration >= MAX_TOOL_ITERATIONS) {
    context.runtime.callbacks.onTrace(
      `Completion reached max tool iterations (${MAX_TOOL_ITERATIONS})`,
    );
  }

  // Finalize with accumulated content
  const finalContent = accumulatedContent || "Completion returned no content.";
  if (!finalMessageId) {
    finalMessageId = context.runtime.callbacks.onAssistantStart({
      name: assistantName,
      variant: ZoeAssistantVariant.Standard,
      nodeId: context.node.id,
    });
    context.runtime.callbacks.onAssistantUpdate(finalMessageId, finalContent);
  }

  context.state.payload = finalContent;
  context.state.conversation = currentConversation;
}

/**
 * Decode HTML entities in a string.
 *
 * @param text - Text that may contain HTML entities.
 */
function decodeHtmlEntities(text: string): string {
  const textarea = document.createElement("textarea");
  textarea.innerHTML = text;
  return textarea.value;
}

/**
 * Merge tool lists while keeping stable ordering and preferring primary names.
 *
 * @param primary - Primary tool list (wins on name collisions).
 * @param secondary - Secondary tool list (skipped when duplicate).
 */
function mergeTools(primary: OpenRouterTool[], secondary: OpenRouterTool[]) {
  if (secondary.length === 0) return primary;
  if (primary.length === 0) return secondary;

  const seen = new Set(primary.map((tool) => tool.function.name));
  const merged = [...primary];

  for (const tool of secondary) {
    const name = tool.function.name;
    if (seen.has(name)) continue;
    seen.add(name);
    merged.push(tool);
  }

  return merged;
}

/**
 * Emit a trace snapshot of the completion context.
 *
 * @param context - Execution context for the node.
 * @param data - Completion node data.
 * @param input - Snapshot input values.
 */
function traceCompletionRequest(
  context: ZoeNodeExecutionContext,
  data: ZoeCompletionNodeData,
  input: {
    label: string;
    requestMessages: Array<{
      role: string;
      content: string | null;
      tool_call_id?: string;
      tool_calls?: OpenRouterToolCall[];
    }>;
  },
) {
  const requestSnapshot = input.requestMessages.map(
    (message): CompletionTraceSnapshotMessage => ({
      role: message.role,
      toolCallId: message.tool_call_id,
      toolCalls: message.tool_calls?.map((call) => ({
        id: call.id,
        name: call.function?.name,
      })),
      content: truncateString(message.content ?? "", 160),
    }),
  );

  const summary = {
    label: input.label,
    nodeId: context.node.id,
    systemPrompt: truncateString(data.systemPrompt ?? "", 160),
    requestMessageCount: input.requestMessages.length,
    requestMessagesPreview: input.requestMessages.map((msg) => ({
      role: msg.role,
      contentLength: msg.content?.length ?? 0,
      contentPreview: truncateString(msg.content ?? "", 80),
    })),
    requestMessages: requestSnapshot,
  };

  context.runtime.callbacks.onTrace(
    `Completion context: ${JSON.stringify(summary, null, 2)}`,
  );
}

/**
 * Truncate long strings for trace output.
 *
 * @param value - Input string value.
 * @param maxLength - Max length for the output.
 */
function truncateString(value: string, maxLength: number) {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength)}…`;
}

/**
 * Parse optional completion tools JSON inputs.
 *
 * @param input - Tooling input options.
 */
function parseCompletionTools(input: {
  useTools: boolean;
  toolsJson: string;
  toolChoiceJson: string;
}): CompletionToolsParseResult {
  if (!input.useTools) {
    return { tools: null, toolChoice: null, error: null };
  }

  const toolsResult = parseOptionalJson<OpenRouterTool[]>(
    "Tools",
    input.toolsJson,
  );
  if (toolsResult.error) {
    return { tools: null, toolChoice: null, error: toolsResult.error };
  }

  const toolChoiceResult = parseOptionalJson<OpenRouterToolChoice>(
    "Tool choice",
    input.toolChoiceJson,
  );
  if (toolChoiceResult.error) {
    return { tools: null, toolChoice: null, error: toolChoiceResult.error };
  }

  return {
    tools: toolsResult.value,
    toolChoice: toolChoiceResult.value,
    error: null,
  };
}

/**
 * Parse an optional JSON field with a friendly error message.
 *
 * @param label - Label for the field.
 * @param raw - Raw JSON input.
 */
function parseOptionalJson<T>(
  label: string,
  raw?: string,
): { value: T | null; error: string | null } {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) {
    return { value: null, error: null };
  }

  try {
    return { value: JSON.parse(trimmed) as T, error: null };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown JSON error.";
    return { value: null, error: `${label} JSON is invalid: ${message}` };
  }
}

/**
 * Parse JSON tool call arguments.
 *
 * @param rawArguments - Raw tool call arguments string.
 */
function parseToolCallArguments(rawArguments?: string) {
  const trimmed = (rawArguments ?? "").trim();
  if (!trimmed) return {};

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return { __raw: trimmed };
  }
}
