import {
  ZoeAttributeKind,
  ZoeNodeCategory,
  ZoeNodeID,
  ZoePortDirection,
  type ZoeGetVariableNodeData,
  type ZoeNodeDefinition,
} from "@/zoeflow/types";

import { GET_VARIABLE_DEFAULTS } from "@/zoeflow/nodes/shared/defaults";

/**
 * Create default data for the Get Variable node.
 */
export function createGetVariableNodeData(): ZoeGetVariableNodeData {
  return {
    type: ZoeNodeID.GetVariable,
    title: "Get Variable",
    label: "",
    path: GET_VARIABLE_DEFAULTS.path,
  };
}

export const getVariableNodeDefinition: ZoeNodeDefinition<ZoeGetVariableNodeData> =
  {
    type: ZoeNodeID.GetVariable,
    label: "Get Variable",
    description: "Get a variable value using a dot-notation path.",
    category: ZoeNodeCategory.Function,
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
        key: "path",
        label: "Path",
        kind: ZoeAttributeKind.Text,
        description:
          "Dot-notation path to the variable (e.g., 'world.user.name').",
        placeholder: "world.user.name",
      },
    ],
    inputPorts: [
      {
        id: "in",
        label: "In",
        direction: ZoePortDirection.Input,
      },
      {
        id: "path",
        label: "Path",
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
    createData: createGetVariableNodeData,
  };
