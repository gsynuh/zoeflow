import type { ZoeNodeExecutionContext } from "@/zoeflow/engine/types";
import { redactText } from "@/zoeflow/nodes/redact/redact";
import { getNodeTitle } from "@/zoeflow/nodes/shared/title";
import type { ZoeRedactNodeData } from "@/zoeflow/types";

/**
 * Execute the Redact node.
 *
 * @param context - Execution context for the node.
 * @param data - Redact node data.
 */
export async function executeRedactNode(
  context: ZoeNodeExecutionContext,
  data: ZoeRedactNodeData,
) {
  context.runtime.callbacks.onTrace(`Executing: ${getNodeTitle(context.node)}`);

  const payload = context.state.payload;
  if (typeof payload !== "string") {
    throw new Error(
      `Redact node expects string input (${context.node.id}), got ${payload === null ? "null" : typeof payload}.`,
    );
  }

  context.state.payload = redactText(payload, data);
}
