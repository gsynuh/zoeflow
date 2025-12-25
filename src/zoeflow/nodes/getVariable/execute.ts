import { evaluateInputPortValue } from "@/zoeflow/engine/inputPorts";
import type { ZoeNodeExecutionContext } from "@/zoeflow/engine/types";
import { getNestedValue } from "@/zoeflow/nodes/globalState/utils";
import { getNodeTitle } from "@/zoeflow/nodes/shared/title";
import type { ZoeGetVariableNodeData } from "@/zoeflow/types";

/**
 * Execute the Get Variable node.
 *
 * @param context - Execution context for the node.
 * @param data - Get Variable node data.
 */
export async function executeGetVariableNode(
  context: ZoeNodeExecutionContext,
  data: ZoeGetVariableNodeData,
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
    throw new Error(`Get Variable node (${context.node.id}) requires a path.`);
  }

  // Get the nested value
  const value = getNestedValue(context.state.vars, path);

  context.runtime.callbacks.onTrace(
    `Get variable "${path}" = ${JSON.stringify(value ?? undefined)}`,
  );

  // Set payload to the retrieved value
  context.state.payload = value ?? null;
}
