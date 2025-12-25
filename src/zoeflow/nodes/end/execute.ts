import type {
  ZoeNodeExecutionContext,
  ZoeNodeExecutionResult,
} from "@/zoeflow/engine/types";
import { getNodeTitle } from "@/zoeflow/nodes/shared/title";

/**
 * Execute the End node.
 *
 * @param context - Execution context for the node.
 */
export async function executeEndNode(
  context: ZoeNodeExecutionContext,
): Promise<ZoeNodeExecutionResult> {
  context.runtime.callbacks.onTrace(`Executing: ${getNodeTitle(context.node)}`);
  return { stop: true };
}
