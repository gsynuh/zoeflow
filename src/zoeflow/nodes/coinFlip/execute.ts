import type { ZoeNodeExecutionContext } from "@/zoeflow/engine/types";
import { getNodeTitle } from "@/zoeflow/nodes/shared/title";
import type { ZoeCoinFlipNodeData } from "@/zoeflow/types";

/**
 * Execute the CoinFlip node.
 *
 * CoinFlip nodes serve as tool providers for Completion nodes and do not
 * participate in the runtime execution path unless explicitly traversed.
 *
 * @param context - Execution context for the node.
 * @param data - CoinFlip node data.
 */
export async function executeCoinFlipNode(
  context: ZoeNodeExecutionContext,
  data: ZoeCoinFlipNodeData,
) {
  context.runtime.callbacks.onTrace(`Executing: ${getNodeTitle(context.node)}`);
  void data;
}
