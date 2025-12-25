export type OpenRouterModelPricing = {
  prompt?: string;
  completion?: string;
  request?: string;
  image?: string;
  audio?: string;
  web_search?: string;
  internal_reasoning?: string;
  thinking?: string;
  input_cache_read?: string;
  [key: string]: string | undefined;
};

export type OpenRouterModel = {
  id: string;
  name?: string;
  description?: string;
  context_length?: number;
  pricing?: OpenRouterModelPricing;
};

export type OpenRouterModelsResponse = {
  data: OpenRouterModel[];
};

/**
 * Convert a list response into an id-indexed map for fast lookups.
 *
 * @param response - OpenRouter models list response.
 */
export function indexOpenRouterModelsById(response: OpenRouterModelsResponse) {
  return Object.fromEntries(response.data.map((model) => [model.id, model]));
}
