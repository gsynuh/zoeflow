import type {
  OpenRouterCompletionRequest,
  OpenRouterCompletionResponse,
} from "@/zoeflow/openrouter/types";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

type OpenRouterRequestOptions = {
  signal?: AbortSignal;
};

/**
 * Request a chat completion from OpenRouter.
 */
export async function requestOpenRouterCompletion(
  payload: OpenRouterCompletionRequest,
  options?: OpenRouterRequestOptions,
): Promise<OpenRouterCompletionResponse> {
  const response = await fetch(
    OPENROUTER_API_URL,
    buildOpenRouterRequest(payload, options),
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenRouter request failed (${response.status}): ${body}`);
  }

  return (await response.json()) as OpenRouterCompletionResponse;
}

/**
 * Request a streaming chat completion from OpenRouter.
 */
export async function requestOpenRouterCompletionStream(
  payload: OpenRouterCompletionRequest,
  options?: OpenRouterRequestOptions,
): Promise<Response> {
  const response = await fetch(
    OPENROUTER_API_URL,
    buildOpenRouterRequest(payload, options),
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenRouter request failed (${response.status}): ${body}`);
  }

  return response;
}

/**
 * Build the request init for OpenRouter calls.
 */
function buildOpenRouterRequest(
  payload: OpenRouterCompletionRequest,
  options?: OpenRouterRequestOptions,
): RequestInit {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error("Missing OPENROUTER_API_KEY for OpenRouter requests.");
  }

  return {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
    signal: options?.signal,
  };
}
