import starterGuardrails from "@/content/flows/starter.json";

/**
 * List of flow JSON exports shipped with the app (seeded into localStorage on first load).
 *
 * Add new shipped flows by placing a JSON export in `content/flows/` and importing it here.
 */
export const shippedFlowExports: unknown[] = [starterGuardrails];

/**
 * Stable shipped flow ids derived from `shippedFlowExports`.
 */
export const shippedFlowIds: string[] = shippedFlowExports
  .map((entry) => {
    if (!entry || typeof entry !== "object") return null;
    const record = entry as Record<string, unknown>;
    return typeof record.id === "string" ? record.id : null;
  })
  .filter((id): id is string => Boolean(id));

const shippedFlowIdSet = new Set(shippedFlowIds);

/**
 * Check whether the given flow id belongs to a shipped (built-in) flow.
 *
 * @param flowId - Flow id to check.
 */
export function isShippedFlowId(flowId: string) {
  return shippedFlowIdSet.has(flowId);
}
