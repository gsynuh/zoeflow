import type { OpenRouterModelPricing } from "@/zoeflow/openrouter/models";

export type OpenRouterModelPricingSide = "prompt" | "completion";

/**
 * Parse OpenRouter price strings (USD per token) into numbers.
 *
 * @param value - Price string from OpenRouter.
 */
export function parseUsdPerToken(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

/**
 * Resolve the USD-per-token price for a prompt or completion side.
 *
 * @param pricing - Model pricing metadata from OpenRouter.
 * @param side - Billing side (prompt vs completion).
 */
export function getUsdPerToken(
  pricing: OpenRouterModelPricing | undefined,
  side: OpenRouterModelPricingSide,
): number | null {
  if (!pricing) return null;
  return parseUsdPerToken(
    side === "prompt" ? pricing.prompt : pricing.completion,
  );
}

/**
 * Estimate the USD cost for a token count and model pricing side.
 *
 * @param tokenCount - Token count to price.
 * @param pricing - Model pricing metadata from OpenRouter.
 * @param side - Billing side (prompt vs completion).
 */
export function estimateUsdCost(
  tokenCount: number,
  pricing: OpenRouterModelPricing | undefined,
  side: OpenRouterModelPricingSide,
): number | null {
  const usdPerToken = getUsdPerToken(pricing, side);
  if (usdPerToken === null) return null;
  if (!Number.isFinite(tokenCount) || tokenCount <= 0) return 0;
  return tokenCount * usdPerToken;
}
