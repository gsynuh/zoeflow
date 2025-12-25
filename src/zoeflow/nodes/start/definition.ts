import {
  ZoeNodeCategory,
  ZoeNodeID,
  ZoePortDirection,
  type ZoeNodeDefinition,
  type ZoeStartNodeData,
} from "@/zoeflow/types";

import defaultInstructions from "@/content/nodes/start/instructions.md";
import { START_DEFAULTS } from "@/zoeflow/nodes/shared/defaults";

/**
 * Create default data for the Start node.
 */
export function createStartNodeData(): ZoeStartNodeData {
  return {
    type: ZoeNodeID.Start,
    title: START_DEFAULTS.title,
    label: "",
    defaultUserPrompt: defaultInstructions,
  };
}

export const startNodeDefinition: ZoeNodeDefinition<ZoeStartNodeData> = {
  type: ZoeNodeID.Start,
  label: "Start",
  description: "The first node in the flow.",
  category: ZoeNodeCategory.Boundaries,
  allowUserCreate: false,
  requiredCount: 1,
  showUserLabelOnCanvas: false,
  attributes: [],
  inputPorts: [],
  outputPorts: [
    {
      id: "out",
      label: "Out",
      direction: ZoePortDirection.Output,
    },
  ],
  createData: createStartNodeData,
};
