import {
  ZoeAttributeKind,
  ZoeNodeCategory,
  ZoeNodeID,
  ZoePortDirection,
  type ZoeCoinFlipNodeData,
  type ZoeNodeDefinition,
} from "@/zoeflow/types";

import { COIN_FLIP_DEFAULTS } from "@/zoeflow/nodes/shared/defaults";

/**
 * Create default data for the CoinFlip node.
 */
export function createCoinFlipNodeData(): ZoeCoinFlipNodeData {
  return {
    type: ZoeNodeID.CoinFlip,
    title: COIN_FLIP_DEFAULTS.title,
    label: "",
  };
}

export const coinFlipNodeDefinition: ZoeNodeDefinition<ZoeCoinFlipNodeData> = {
  type: ZoeNodeID.CoinFlip,
  label: "Coin Flip",
  description: "Flips a virtual coin and returns heads or tails.",
  category: ZoeNodeCategory.Tool,
  allowUserCreate: true,
  requiredCount: null,
  attributes: [
    {
      key: "label",
      label: "Label",
      kind: ZoeAttributeKind.Text,
      description: "Optional label for this node.",
      placeholder: "",
    },
  ],
  inputPorts: [
    {
      id: "trigger",
      label: "Trigger",
      direction: ZoePortDirection.Input,
    },
    {
      id: "enable",
      label: "Enable",
      direction: ZoePortDirection.Input,
    },
  ],
  outputPorts: [
    {
      id: "out",
      label: "Out",
      direction: ZoePortDirection.Output,
    },
  ],
  createData: createCoinFlipNodeData,
};
