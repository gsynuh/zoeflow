import { NextResponse } from "next/server";

import {
  requestOpenRouterCompletion,
  requestOpenRouterCompletionStream,
} from "@/zoeflow/openrouter/client";
import type {
  OpenRouterCompletionRequest,
  OpenRouterUsage,
} from "@/zoeflow/openrouter/types";
import { normalizeOpenRouterUsage } from "@/zoeflow/openrouter/usage";
import { UsageEventSource } from "@/zoeflow/stats/types";
import { recordUsageEvent } from "@/zoeflow/stats/usageLedger";

export const runtime = "nodejs";

/**
 * Proxy a streaming SSE response while extracting the final usage payload.
 *
 * @param input - Upstream SSE body.
 * @param onUsage - Callback invoked with the last usage payload (if present).
 */
function teeUsageFromSseStream(
  input: ReadableStream<Uint8Array>,
  onUsage: (usage: unknown) => Promise<void>,
): ReadableStream<Uint8Array> {
  const reader = input.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let lastUsage: unknown | null = null;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await reader.read();
      if (done) {
        buffer += decoder.decode();

        const remaining = buffer.trim();
        if (remaining.startsWith("data:")) {
          const payload = remaining.slice(5).trim();
          if (payload && payload !== "[DONE]") {
            try {
              const parsed = JSON.parse(payload) as { usage?: unknown };
              if (parsed.usage) {
                lastUsage = parsed.usage;
              }
            } catch {
              // Ignore malformed trailing SSE payloads.
            }
          }
        }

        if (lastUsage) {
          try {
            await onUsage(lastUsage);
          } catch {
            // Usage recording is best-effort; never fail the completion stream.
          }
        }

        controller.close();
        return;
      }

      if (value) {
        controller.enqueue(value);
        buffer += decoder.decode(value, { stream: true });

        let newlineIndex = buffer.indexOf("\n");
        while (newlineIndex >= 0) {
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);

          if (line.startsWith("data:")) {
            const payload = line.slice(5).trim();
            if (payload && payload !== "[DONE]") {
              try {
                const parsed = JSON.parse(payload) as { usage?: unknown };
                if (parsed.usage) {
                  lastUsage = parsed.usage;
                }
              } catch {
                // Ignore malformed SSE data payloads.
              }
            }
          }

          newlineIndex = buffer.indexOf("\n");
        }
      }
    },
    async cancel(reason) {
      await reader.cancel(reason);
    },
  });
}

/**
 * Proxy completion requests to OpenRouter.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as OpenRouterCompletionRequest;

    if (!body?.model || !Array.isArray(body.messages)) {
      return NextResponse.json(
        { error: "Invalid completion payload." },
        { status: 400 },
      );
    }

    const controller = new AbortController();
    request.signal.addEventListener("abort", () => controller.abort());

    if (body.stream) {
      const streamResponse = await requestOpenRouterCompletionStream(body, {
        signal: controller.signal,
      });
      if (!streamResponse.body) {
        return NextResponse.json(
          { error: "OpenRouter stream response was empty." },
          { status: 502 },
        );
      }

      const proxiedStream = teeUsageFromSseStream(
        streamResponse.body,
        async (usagePayload) => {
          const normalized = normalizeOpenRouterUsage(
            usagePayload as OpenRouterUsage,
          );
          if (!normalized) return;
          if (typeof normalized.cost !== "number") return;
          if (!Number.isFinite(normalized.cost)) return;

          await recordUsageEvent({
            at: Date.now(),
            source: UsageEventSource.NodeExecution,
            model: body.model,
            promptTokens: normalized.promptTokens,
            completionTokens: normalized.completionTokens,
            totalTokens: normalized.totalTokens,
            cost: normalized.cost,
            upstreamCost: normalized.upstreamCost,
            meta: { route: "/api/v1/completion", stream: true },
          });
        },
      );

      return new Response(proxiedStream, {
        status: streamResponse.status,
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      });
    }

    const response = await requestOpenRouterCompletion(body, {
      signal: controller.signal,
    });

    const normalized = normalizeOpenRouterUsage(response.usage);
    if (
      normalized &&
      typeof normalized.cost === "number" &&
      Number.isFinite(normalized.cost)
    ) {
      await recordUsageEvent({
        at: Date.now(),
        source: UsageEventSource.NodeExecution,
        model: body.model,
        promptTokens: normalized.promptTokens,
        completionTokens: normalized.completionTokens,
        totalTokens: normalized.totalTokens,
        cost: normalized.cost,
        upstreamCost: normalized.upstreamCost,
        meta: { route: "/api/v1/completion", stream: false },
      });
    }
    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
