import type { ZoeNodeExecutionContext } from "@/zoeflow/engine/types";
import { getNodeTitle } from "@/zoeflow/nodes/shared/title";
import type { ZoeRagNodeData } from "@/zoeflow/types";

/**
 * Execute the RAG node.
 *
 * RAG nodes serve as tool + context providers for Completion nodes and do not
 * participate in the runtime execution path unless explicitly traversed.
 *
 * @param context - Execution context for the node.
 * @param data - RAG node data.
 */
export async function executeRagNode(
  context: ZoeNodeExecutionContext,
  data: ZoeRagNodeData,
) {
  context.runtime.callbacks.onTrace(`Executing: ${getNodeTitle(context.node)}`);
  void data;
}
