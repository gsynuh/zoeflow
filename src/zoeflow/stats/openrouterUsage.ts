import type { UsageEvent, UsageEventSource } from "@/zoeflow/stats/types";

/**
 * Convert an OpenRouter embeddings usage payload into a usage event.
 *
 * Embeddings usage typically only includes prompt/total tokens and cost.
 *
 * @param input - Embeddings usage fields.
 */
export function buildEmbeddingUsageEvent(input: {
  source: UsageEventSource;
  model: string;
  usage: {
    prompt_tokens?: number;
    total_tokens?: number;
    cost?: number;
    cost_details?: { upstream_inference_cost?: number };
  };
  meta?: Record<string, unknown>;
}): UsageEvent | null {
  const model = input.model.trim();
  if (!model) return null;
  const cost = input.usage.cost;
  if (typeof cost !== "number" || !Number.isFinite(cost)) return null;

  const promptTokens = input.usage.prompt_tokens ?? 0;
  const totalTokens = input.usage.total_tokens ?? promptTokens;
  const upstreamCost = input.usage.cost_details?.upstream_inference_cost;

  return {
    at: Date.now(),
    source: input.source,
    model,
    promptTokens,
    completionTokens: 0,
    totalTokens,
    cost,
    upstreamCost,
    meta: input.meta,
  };
}

/**
 * Convert an OpenRouter completion usage payload into a usage event.
 *
 * @param input - Completion usage fields.
 */
export function buildCompletionUsageEvent(input: {
  source: UsageEventSource;
  model: string;
  usage: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    cost?: number;
    cost_details?: { upstream_inference_cost?: number };
  };
  meta?: Record<string, unknown>;
}): UsageEvent | null {
  const model = input.model.trim();
  if (!model) return null;
  const cost = input.usage.cost;
  if (typeof cost !== "number" || !Number.isFinite(cost)) return null;

  const promptTokens = input.usage.prompt_tokens ?? 0;
  const completionTokens = input.usage.completion_tokens ?? 0;
  const totalTokens =
    input.usage.total_tokens ?? Math.max(0, promptTokens + completionTokens);
  const upstreamCost = input.usage.cost_details?.upstream_inference_cost;

  return {
    at: Date.now(),
    source: input.source,
    model,
    promptTokens,
    completionTokens,
    totalTokens,
    cost,
    upstreamCost,
    meta: input.meta,
  };
}
