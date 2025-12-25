import type { ZoeNodeExecutionContext } from "@/zoeflow/engine/types";
import { getNodeTitle } from "@/zoeflow/nodes/shared/title";
import type { ZoeGlobalStateNodeData } from "@/zoeflow/types";

/**
 * Execute the Global State node.
 *
 * Global State nodes serve as metadata providers for Completion nodes.
 * The actual tool execution happens when LLMs call the global_state tool.
 *
 * @param context - Execution context for the node.
 * @param data - Global State node data.
 */
export async function executeGlobalStateNode(
  context: ZoeNodeExecutionContext,
  data: ZoeGlobalStateNodeData,
) {
  context.runtime.callbacks.onTrace(`Executing: ${getNodeTitle(context.node)}`);
  void data;
}
