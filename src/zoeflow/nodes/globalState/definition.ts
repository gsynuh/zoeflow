import {
  ZoeAttributeKind,
  ZoeNodeCategory,
  ZoeNodeID,
  ZoePortDirection,
  type ZoeGlobalStateNodeData,
  type ZoeNodeDefinition,
} from "@/zoeflow/types";

import { GLOBAL_STATE_DEFAULTS } from "@/zoeflow/nodes/shared/defaults";

/**
 * Create default data for the Global State node.
 */
export function createGlobalStateNodeData(): ZoeGlobalStateNodeData {
  return {
    type: ZoeNodeID.GlobalState,
    title: GLOBAL_STATE_DEFAULTS.title,
    label: "",
    instructions: GLOBAL_STATE_DEFAULTS.instructions,
  };
}

export const globalStateNodeDefinition: ZoeNodeDefinition<ZoeGlobalStateNodeData> =
  {
    type: ZoeNodeID.GlobalState,
    label: "Global State",
    description:
      "Expose a tool to LLMs for setting and getting global variables.",
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
      {
        key: "instructions",
        label: "Instructions",
        kind: ZoeAttributeKind.Text,
        description:
          "Instructions specific to this graph for using the global state tool. These will be included in the tool description for LLMs.",
        placeholder:
          "e.g., Use 'user.preferences' to store user preferences...",
        multiline: true,
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
    createData: createGlobalStateNodeData,
  };
