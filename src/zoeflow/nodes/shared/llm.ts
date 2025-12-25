/**
 * Convert an input payload into a completion prompt string.
 *
 * @param input - Payload input.
 */
export function toUserMessage(input: unknown) {
  if (typeof input === "string") return input;
  if (input === null || input === undefined) return "";
  try {
    return JSON.stringify(input);
  } catch {
    return String(input);
  }
}
