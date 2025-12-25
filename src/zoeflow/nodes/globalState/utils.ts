/**
 * Set a nested value in an object using dot-notation path.
 *
 * @param obj - Target object to modify.
 * @param path - Dot-notation path (e.g., "world.user.name").
 * @param value - Value to set.
 * @throws Error if path is invalid or cannot be set.
 */
export function setNestedValue(
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  if (!path || typeof path !== "string") {
    throw new Error(`Invalid path: ${path}`);
  }

  const parts = path.split(".");
  if (parts.length === 0) {
    throw new Error(`Invalid path: ${path}`);
  }

  let current: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!part) {
      throw new Error(`Invalid path segment at index ${i}: ${path}`);
    }

    if (
      !(part in current) ||
      typeof current[part] !== "object" ||
      current[part] === null
    ) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }

  const lastPart = parts[parts.length - 1];
  if (!lastPart) {
    throw new Error(`Invalid path: ${path}`);
  }
  current[lastPart] = value;
}

/**
 * Get a nested value from an object using dot-notation path.
 *
 * @param obj - Source object to read from.
 * @param path - Dot-notation path (e.g., "world.user.name").
 * @returns The value at the path, or undefined if not found.
 */
export function getNestedValue(
  obj: Record<string, unknown>,
  path: string,
): unknown {
  if (!path || typeof path !== "string") {
    return undefined;
  }

  const parts = path.split(".");
  if (parts.length === 0) {
    return undefined;
  }

  let current: unknown = obj;
  for (const part of parts) {
    if (!part) {
      return undefined;
    }
    if (typeof current !== "object" || current === null || !(part in current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}
