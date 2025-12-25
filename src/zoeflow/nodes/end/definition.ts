import {
  ZoeNodeCategory,
  ZoeNodeID,
  ZoePortDirection,
  type ZoeEndNodeData,
  type ZoeNodeDefinition,
} from "@/zoeflow/types";

import { END_DEFAULTS } from "@/zoeflow/nodes/shared/defaults";

/**
 * Create default data for the End node.
 */
export function createEndNodeData(): ZoeEndNodeData {
  return {
    type: ZoeNodeID.End,
    title: END_DEFAULTS.title,
    label: "",
  };
}

export const endNodeDefinition: ZoeNodeDefinition<ZoeEndNodeData> = {
  type: ZoeNodeID.End,
  label: "End",
  description: "The last node in the flow.",
  category: ZoeNodeCategory.Boundaries,
  allowUserCreate: true,
  requiredCount: null,
  showUserLabelOnCanvas: false,
  attributes: [],
  inputPorts: [
    {
      id: "in",
      label: "In",
      direction: ZoePortDirection.Input,
    },
  ],
  outputPorts: [],
  createData: createEndNodeData,
};
