import type {
  OpenRouterEmbeddingsRequest,
  OpenRouterEmbeddingsResponse,
} from "@/zoeflow/openrouter/embeddingsTypes";

const OPENROUTER_EMBEDDINGS_URL = "https://openrouter.ai/api/v1/embeddings";

type OpenRouterRequestOptions = {
  signal?: AbortSignal;
};

/**
 * Request embeddings from OpenRouter.
 *
 * @param payload - Embeddings request payload.
 * @param options - Optional request options.
 */
export async function requestOpenRouterEmbeddings(
  payload: OpenRouterEmbeddingsRequest,
  options?: OpenRouterRequestOptions,
): Promise<OpenRouterEmbeddingsResponse> {
  const response = await fetch(
    OPENROUTER_EMBEDDINGS_URL,
    buildOpenRouterRequest(payload, options),
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `OpenRouter embeddings request failed (${response.status}): ${body}`,
    );
  }

  return (await response.json()) as OpenRouterEmbeddingsResponse;
}

/**
 * Build the request init for OpenRouter calls.
 *
 * @param payload - JSON payload for the request.
 * @param options - Optional request options.
 */
function buildOpenRouterRequest(
  payload: OpenRouterEmbeddingsRequest,
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
