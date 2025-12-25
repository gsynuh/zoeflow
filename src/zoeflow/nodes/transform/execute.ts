import { invalidateEvaluationCache } from "@/zoeflow/engine/evaluator";
import { evaluateFunctionBody } from "@/zoeflow/engine/expression";
import type { ZoeNodeExecutionContext } from "@/zoeflow/engine/types";
import { getNodeTitle } from "@/zoeflow/nodes/shared/title";
import type { ZoeTransformNodeData } from "@/zoeflow/types";

/**
 * Execute the Transform node.
 *
 * @param context - Execution context for the node.
 * @param data - Transform node data.
 */
export async function executeTransformNode(
  context: ZoeNodeExecutionContext,
  data: ZoeTransformNodeData,
) {
  context.runtime.callbacks.onTrace(`Executing: ${getNodeTitle(context.node)}`);

  const log = (...args: unknown[]) => {
    const message = args.map(formatTransformLogValue).join(" ");
    context.runtime.callbacks.onTrace(
      `Transform log (${context.node.id}): ${message}`,
    );
  };

  const result = evaluateFunctionBody(data.expression ?? "", context.scope, {
    state: context.state,
    log,
  });
  if (result.error) {
    throw new Error(
      `Transform function failed (${context.node.id}): ${result.error}`,
    );
  }
  context.state.payload = result.value;
  invalidateEvaluationCache(context.evaluationContext);
}

/**
 * Safely format log values from Transform function bodies.
 *
 * @param value - Logged value.
 */
function formatTransformLogValue(value: unknown) {
  if (value === null || value === undefined) return String(value);
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
