import type { ZoeAssistantUsage } from "@/zoeflow/engine/types";
import type { OpenRouterCompletionRequest, OpenRouterUsage } from "./types";

/**
 * Ensure OpenRouter usage accounting is enabled on a completion payload.
 *
 * @param payload - OpenRouter completion request payload.
 */
export function withOpenRouterUsageAccounting(
  payload: OpenRouterCompletionRequest,
): OpenRouterCompletionRequest {
  const include = payload.usage?.include === true;
  if (include) return payload;
  return { ...payload, usage: { include: true } };
}

/**
 * Normalize OpenRouter usage into Zoe's assistant usage shape.
 *
 * @param usage - Usage payload from OpenRouter responses.
 */
export function normalizeOpenRouterUsage(
  usage: OpenRouterUsage | undefined,
): ZoeAssistantUsage | null {
  if (!usage) return null;

  const promptTokens = usage.prompt_tokens ?? 0;
  const completionTokens = usage.completion_tokens ?? 0;
  const totalTokens =
    usage.total_tokens ?? Math.max(0, promptTokens + completionTokens);

  return {
    promptTokens,
    completionTokens,
    totalTokens,
    cost: usage.cost,
    upstreamCost: usage.cost_details?.upstream_inference_cost,
  };
}
