import {
  evaluateNodeOutput,
  type ZoeEvaluationContext,
} from "@/zoeflow/engine/evaluator";

/**
 * Evaluate the value of an input port by reading from a connected source node.
 *
 * @param nodeId - Target node ID.
 * @param portId - Input port ID to evaluate.
 * @param context - Evaluation context.
 * @returns The value from the connected source node, or null if not connected.
 */
export function evaluateInputPortValue(
  nodeId: string,
  portId: string,
  context: ZoeEvaluationContext,
): unknown | null {
  const incoming = context.edgesByTarget.get(nodeId) ?? [];
  const edge = incoming.find((e) => e.targetPort === portId);
  if (!edge) return null;

  return evaluateNodeOutput(edge.source, context);
}

/**
 * Evaluate a boolean input port with a default value.
 *
 * @param nodeId - Target node ID.
 * @param portId - Input port ID to evaluate.
 * @param context - Evaluation context.
 * @param defaultValue - Default value if port is not connected.
 * @returns Boolean value from connected node, or default if not connected.
 */
export function evaluateBooleanInputPort(
  nodeId: string,
  portId: string,
  context: ZoeEvaluationContext,
  defaultValue: boolean,
): boolean {
  const value = evaluateInputPortValue(nodeId, portId, context);
  if (value === null) return defaultValue;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (
      normalized === "false" ||
      normalized === "0" ||
      normalized === "no" ||
      normalized === "off"
    ) {
      return false;
    }
    if (
      normalized === "true" ||
      normalized === "1" ||
      normalized === "yes" ||
      normalized === "on"
    ) {
      return true;
    }
  }
  return Boolean(value);
}
