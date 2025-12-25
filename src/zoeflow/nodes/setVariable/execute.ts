import { invalidateEvaluationCache } from "@/zoeflow/engine/evaluator";
import { evaluateInputPortValue } from "@/zoeflow/engine/inputPorts";
import type { ZoeNodeExecutionContext } from "@/zoeflow/engine/types";
import { setNestedValue } from "@/zoeflow/nodes/globalState/utils";
import { getNodeTitle } from "@/zoeflow/nodes/shared/title";
import type { ZoeSetVariableNodeData } from "@/zoeflow/types";

/**
 * Execute the Set Variable node.
 *
 * @param context - Execution context for the node.
 * @param data - Set Variable node data.
 */
export async function executeSetVariableNode(
  context: ZoeNodeExecutionContext,
  data: ZoeSetVariableNodeData,
) {
  context.runtime.callbacks.onTrace(`Executing: ${getNodeTitle(context.node)}`);

  // Get path from input port or fall back to attribute
  const pathInput = evaluateInputPortValue(
    context.node.id,
    "path",
    context.evaluationContext,
  );
  const path =
    typeof pathInput === "string"
      ? pathInput.trim()
      : (data.path?.trim() ?? "");

  if (!path) {
    throw new Error(`Set Variable node (${context.node.id}) requires a path.`);
  }

  // Get value from input port or fall back to attribute
  const valueInput = evaluateInputPortValue(
    context.node.id,
    "value",
    context.evaluationContext,
  );
  const value = valueInput !== null ? valueInput : (data.value ?? "");

  // Set the nested value
  try {
    setNestedValue(context.state.vars, path, value);
    invalidateEvaluationCache(context.evaluationContext);
    context.runtime.callbacks.onTrace(
      `Set variable "${path}" = ${JSON.stringify(value)}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    throw new Error(`Set Variable failed (${context.node.id}): ${message}`);
  }

  // Pass through the input payload
}
