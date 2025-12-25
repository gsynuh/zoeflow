import type { ZoeNodeExecutionContext } from "@/zoeflow/engine/types";
import { getNodeTitle } from "@/zoeflow/nodes/shared/title";
import type { ZoeDiceRollNodeData } from "@/zoeflow/types";

/**
 * Execute the DiceRoll node.
 *
 * DiceRoll nodes serve as tool providers for Completion nodes and do not
 * participate in the runtime execution path unless explicitly traversed.
 *
 * @param context - Execution context for the node.
 * @param data - DiceRoll node data.
 */
export async function executeDiceRollNode(
  context: ZoeNodeExecutionContext,
  data: ZoeDiceRollNodeData,
) {
  context.runtime.callbacks.onTrace(`Executing: ${getNodeTitle(context.node)}`);
  void data;
}
