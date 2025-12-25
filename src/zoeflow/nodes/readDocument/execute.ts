import type { ZoeNodeExecutionContext } from "@/zoeflow/engine/types";
import { getNodeTitle } from "@/zoeflow/nodes/shared/title";
import type { ZoeReadDocumentNodeData } from "@/zoeflow/types";

/**
 * Execute the ReadDocument node.
 *
 * ReadDocument nodes serve as tool providers for Completion nodes and do not
 * participate in the runtime execution path unless explicitly traversed.
 *
 * @param context - Execution context for the node.
 * @param data - ReadDocument node data.
 */
export async function executeReadDocumentNode(
  context: ZoeNodeExecutionContext,
  data: ZoeReadDocumentNodeData,
) {
  context.runtime.callbacks.onTrace(`Executing: ${getNodeTitle(context.node)}`);
  void data;
}
