export enum UsageEventSource {
  NodeExecution = "node_execution",
  DocumentProcessing = "document_processing",
  EmbeddingsProxy = "embeddings_proxy",
}

export type UsageEvent = {
  at: number;
  source: UsageEventSource;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
  upstreamCost?: number;
  meta?: Record<string, unknown>;
};

export type UsageTotals = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
  upstreamCost: number;
};

export type UsageSummary = {
  total: UsageTotals;
  byModel: Record<string, UsageTotals>;
};
