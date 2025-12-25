export type OpenRouterEmbeddingsRequest = {
  model: string;
  input: string | string[];
};

export type OpenRouterEmbeddingsDatum = {
  object?: string;
  index: number;
  embedding: number[];
};

export type OpenRouterEmbeddingsResponse = {
  object?: string;
  model: string;
  data: OpenRouterEmbeddingsDatum[];
  usage?: {
    prompt_tokens?: number;
    total_tokens?: number;
  };
};
