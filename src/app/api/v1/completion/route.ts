import { NextResponse } from "next/server";

import {
  requestOpenRouterCompletion,
  requestOpenRouterCompletionStream,
} from "@/zoeflow/openrouter/client";
import type { OpenRouterCompletionRequest } from "@/zoeflow/openrouter/types";

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
      return new Response(streamResponse.body, {
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
    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
