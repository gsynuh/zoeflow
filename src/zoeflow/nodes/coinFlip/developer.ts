import type { ZoeDeveloperToolDefinition } from "@/zoeflow/nodes/tool/types";
import { ZoeNodeID } from "@/zoeflow/types";

/**
 * Coin Flip tool definition.
 */
export const COIN_FLIP_TOOL: ZoeDeveloperToolDefinition = {
  key: ZoeNodeID.CoinFlip,
  label: "Coin flip",
  description: "Flips a virtual coin.",
  openRouterTool: {
    type: "function",
    function: {
      name: "coin_flip",
      description: "Flip a fair coin and return heads or tails.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  execute: async () => {
    const outcome = Math.random() < 0.5 ? "heads" : "tails";
    return {
      message: `Coin flip result: ${outcome}.`,
      value: { outcome },
    };
  },
};
