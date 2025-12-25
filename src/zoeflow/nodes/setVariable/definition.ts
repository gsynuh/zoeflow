import {
  ZoeAttributeKind,
  ZoeNodeCategory,
  ZoeNodeID,
  ZoePortDirection,
  type ZoeNodeDefinition,
  type ZoeSetVariableNodeData,
} from "@/zoeflow/types";

import { SET_VARIABLE_DEFAULTS } from "@/zoeflow/nodes/shared/defaults";

/**
 * Create default data for the Set Variable node.
 */
export function createSetVariableNodeData(): ZoeSetVariableNodeData {
  return {
    type: ZoeNodeID.SetVariable,
    title: "Set Variable",
    label: "",
    path: SET_VARIABLE_DEFAULTS.path,
    value: SET_VARIABLE_DEFAULTS.value,
  };
}

export const setVariableNodeDefinition: ZoeNodeDefinition<ZoeSetVariableNodeData> =
  {
    type: ZoeNodeID.SetVariable,
    label: "Set Variable",
    description: "Set a variable value using a dot-notation path.",
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
      {
        key: "value",
        label: "Value",
        kind: ZoeAttributeKind.Text,
        description: "Value to set (fallback if not connected via input port).",
        placeholder: "",
        multiline: true,
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
      {
        id: "value",
        label: "Value",
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
    createData: createSetVariableNodeData,
  };
