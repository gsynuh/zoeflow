/**
 * Estimate token count for display purposes when exact tokenizer counts are unavailable.
 *
 * This uses a simple heuristic (≈4 chars/token) that is reasonably close for typical English
 * and code-mixed prompts, but should not be treated as billable truth.
 *
 * @param text - Input text to estimate.
 */
export function estimateTokenCount(text: string): number {
  const normalized = (text ?? "").trim();
  if (!normalized) return 0;

  const approximate = Math.ceil(normalized.length / 4);
  return Math.max(1, approximate);
}
