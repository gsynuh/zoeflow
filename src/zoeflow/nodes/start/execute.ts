import type { ZoeNodeExecutionContext } from "@/zoeflow/engine/types";
import { getNodeTitle } from "@/zoeflow/nodes/shared/title";

/**
 * Execute the Start node.
 *
 * @param context - Execution context for the node.
 */
export async function executeStartNode(context: ZoeNodeExecutionContext) {
  context.runtime.callbacks.onTrace(`Executing: ${getNodeTitle(context.node)}`);
}
