import type { OpenRouterToolCall, OpenRouterUsage } from "./types";

export type OpenRouterStreamResult = {
  text: string;
  usage?: OpenRouterUsage;
  toolCalls?: OpenRouterToolCall[];
};

/**
 * Read a server-sent event stream from OpenRouter and emit text deltas.
 * Returns both the accumulated text, usage data, and tool calls if available.
 */
export async function readOpenRouterStream(
  response: Response,
  onDelta: (chunk: string) => void,
): Promise<OpenRouterStreamResult> {
  if (!response.body) {
    throw new Error("OpenRouter response body is missing.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";
  let usage: OpenRouterUsage | undefined;
  // Use index as key since tool calls arrive incrementally with index field
  const toolCallsMap = new Map<number, OpenRouterToolCall>();

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);

      if (line.startsWith("event:")) {
        const eventType = line.slice(6).trim();
        if (eventType === "usage") {
          // Next line should be data: with usage info
          continue;
        }
      }

      if (line.startsWith("data:")) {
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") {
          newlineIndex = buffer.indexOf("\n");
          continue;
        }

        try {
          const parsed = JSON.parse(payload) as {
            choices?: Array<{
              delta?: {
                content?: string;
                tool_calls?: Array<{
                  index?: number;
                  id?: string;
                  type?: string;
                  function?: {
                    name?: string;
                    arguments?: string;
                  };
                }>;
              };
            }>;
            usage?: OpenRouterUsage;
            prompt_tokens?: number;
            completion_tokens?: number;
            total_tokens?: number;
          };
          const delta = parsed.choices?.[0]?.delta;
          if (delta?.content) {
            fullText += delta.content;
            onDelta(delta.content);
          }

          // Accumulate tool calls from streaming deltas
          // Tool calls arrive incrementally with index field, merging fields as they come
          if (delta?.tool_calls) {
            for (const toolCallDelta of delta.tool_calls) {
              const index = toolCallDelta.index ?? 0;
              const existing = toolCallsMap.get(index);

              if (existing) {
                // Update existing tool call: merge all fields
                if (toolCallDelta.id) {
                  existing.id = toolCallDelta.id;
                }
                if (toolCallDelta.type) {
                  existing.type = toolCallDelta.type as "function";
                }
                if (toolCallDelta.function) {
                  // Ensure function object exists
                  if (!existing.function) {
                    existing.function = { name: "", arguments: "" };
                  }
                  if (toolCallDelta.function.name) {
                    existing.function.name = toolCallDelta.function.name;
                  }
                  if (toolCallDelta.function.arguments) {
                    // Append arguments as they stream in
                    existing.function.arguments =
                      (existing.function.arguments ?? "") +
                      toolCallDelta.function.arguments;
                  }
                }
              } else {
                // Create new tool call
                toolCallsMap.set(index, {
                  id: toolCallDelta.id,
                  type: (toolCallDelta.type ?? "function") as "function",
                  function: {
                    name: toolCallDelta.function?.name ?? "",
                    arguments: toolCallDelta.function?.arguments ?? "",
                  },
                });
              }
            }
          }

          if (parsed.usage) {
            usage = parsed.usage;
          } else if (
            parsed.prompt_tokens !== undefined ||
            parsed.completion_tokens !== undefined
          ) {
            // Usage might be at top level of the data payload
            usage = {
              prompt_tokens: parsed.prompt_tokens,
              completion_tokens: parsed.completion_tokens,
              total_tokens: parsed.total_tokens,
            };
          }
        } catch {
          // Ignore malformed SSE chunks.
        }
      }

      newlineIndex = buffer.indexOf("\n");
    }
  }

  // Filter out incomplete tool calls (must have function name)
  const toolCalls =
    toolCallsMap.size > 0
      ? Array.from(toolCallsMap.entries())
          .sort((a, b) => a[0] - b[0]) // Sort by index
          .map(([, call]) => call)
          .filter((call) => call.function.name.length > 0) // Only return complete tool calls
      : undefined;

  return { text: fullText, usage, toolCalls };
}
