import type { ZoeNodeExecutionContext } from "@/zoeflow/engine/types";
import { getNodeTitle } from "@/zoeflow/nodes/shared/title";
import type { ZoeToolNodeData } from "@/zoeflow/types";

/**
 * Execute the Tool node.
 *
 * Tool nodes serve as metadata providers for Completion nodes and do not
 * participate in the runtime execution path unless explicitly traversed.
 *
 * @param context - Execution context for the node.
 * @param data - Tool node data.
 */
export async function executeToolNode(
  context: ZoeNodeExecutionContext,
  data: ZoeToolNodeData,
) {
  context.runtime.callbacks.onTrace(`Executing: ${getNodeTitle(context.node)}`);
  void data;
}
