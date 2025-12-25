import type { ZoeNodeExecutionContext } from "@/zoeflow/engine/types";
import { appendContextMessage } from "@/zoeflow/nodes/message/context";
import { getNodeTitle } from "@/zoeflow/nodes/shared/title";
import type { ZoeMessageNodeData } from "@/zoeflow/types";

/**
 * Execute the Message node.
 *
 * @param context - Execution context for the node.
 * @param data - Message node data.
 */
export async function executeMessageNode(
  context: ZoeNodeExecutionContext,
  data: ZoeMessageNodeData,
) {
  context.runtime.callbacks.onTrace(`Executing: ${getNodeTitle(context.node)}`);

  const content = data.text?.trim();
  if (!content) return;

  context.state.contextMessages = appendContextMessage(
    context.state.contextMessages,
    {
      role: data.role,
      content,
      priority: data.priority,
      sourceNodeId: context.node.id,
    },
  );
}
