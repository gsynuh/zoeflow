/**
 * Validate and normalize a vector store id.
 *
 * @param raw - Untrusted store id input.
 */
export function normalizeVectorStoreId(raw: unknown) {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) {
    return { value: "default", error: null } as const;
  }

  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(value)) {
    return {
      value: null,
      error:
        "Invalid storeId (expected 1-64 chars: letters, numbers, underscore, hyphen).",
    } as const;
  }

  return { value, error: null } as const;
}

/**
 * Create a stable-ish id for an inserted vector store item.
 *
 * @param prefix - Optional id prefix for grouping.
 */
export function createVectorStoreItemId(prefix?: string) {
  const safePrefix =
    typeof prefix === "string" && prefix.trim() ? prefix.trim() : "vs";
  const random = Math.random().toString(16).slice(2, 10);
  return `${safePrefix}_${Date.now()}_${random}`;
}
