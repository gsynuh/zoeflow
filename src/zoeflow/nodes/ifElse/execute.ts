import { evaluateExpression } from "@/zoeflow/engine/expression";
import type {
  ZoeNodeExecutionContext,
  ZoeNodeExecutionResult,
} from "@/zoeflow/engine/types";
import { getNodeTitle } from "@/zoeflow/nodes/shared/title";
import type { ZoeIfElseNodeData } from "@/zoeflow/types";

/**
 * Execute the If/Else node.
 *
 * @param context - Execution context for the node.
 * @param data - If/Else node data.
 */
export async function executeIfElseNode(
  context: ZoeNodeExecutionContext,
  data: ZoeIfElseNodeData,
): Promise<ZoeNodeExecutionResult> {
  context.runtime.callbacks.onTrace(`Executing: ${getNodeTitle(context.node)}`);

  const result = evaluateExpression<boolean>(
    data.condition ?? "",
    context.scope,
  );
  if (result.error) {
    throw new Error(
      `If/Else condition failed (${context.node.id}): ${result.error}`,
    );
  }
  if (typeof result.value !== "boolean") {
    throw new Error(
      `If/Else condition must return a boolean (${context.node.id}).`,
    );
  }
  const chosenPort = result.value ? "then" : "else";
  return { nextPort: chosenPort };
}
