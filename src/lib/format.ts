/**
 * Format a number with locale-aware thousands separators.
 *
 * @param value - Number to format.
 */
export function formatNumber(value: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(
    value,
  );
}

/**
 * Format a USD amount with a compact precision suitable for token costs.
 *
 * @param value - USD amount.
 */
export function formatUsd(value: number) {
  if (!Number.isFinite(value)) return "$0";
  if (value === 0) return "$0";
  if (Math.abs(value) < 0.01) {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 4,
      maximumFractionDigits: 6,
    }).format(value);
  }
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value);
}
