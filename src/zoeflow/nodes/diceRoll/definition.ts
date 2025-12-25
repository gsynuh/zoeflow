import {
  ZoeAttributeKind,
  ZoeNodeCategory,
  ZoeNodeID,
  ZoePortDirection,
  type ZoeDiceRollNodeData,
  type ZoeNodeDefinition,
} from "@/zoeflow/types";

import { DICE_ROLL_DEFAULTS } from "@/zoeflow/nodes/shared/defaults";

/**
 * Create default data for the DiceRoll node.
 */
export function createDiceRollNodeData(): ZoeDiceRollNodeData {
  return {
    type: ZoeNodeID.DiceRoll,
    title: DICE_ROLL_DEFAULTS.title,
    label: "",
  };
}

export const diceRollNodeDefinition: ZoeNodeDefinition<ZoeDiceRollNodeData> = {
  type: ZoeNodeID.DiceRoll,
  label: "Dice Roll",
  description: "Rolls dice and returns the results.",
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
  createData: createDiceRollNodeData,
};
