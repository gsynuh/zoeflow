import {
  ZoeAttributeKind,
  ZoeNodeCategory,
  ZoeNodeID,
  ZoePortDirection,
  type ZoeIfElseNodeData,
  type ZoeNodeDefinition,
} from "@/zoeflow/types";

import { IF_ELSE_DEFAULTS } from "@/zoeflow/nodes/shared/defaults";

/**
 * Create default data for the If/Else node.
 */
export function createIfElseNodeData(): ZoeIfElseNodeData {
  return {
    type: ZoeNodeID.IfElse,
    title: "Boolean",
    label: "",
    condition: IF_ELSE_DEFAULTS.condition,
  };
}

export const ifElseNodeDefinition: ZoeNodeDefinition<ZoeIfElseNodeData> = {
  type: ZoeNodeID.IfElse,
  label: "Boolean",
  description: "Branch into two paths based on a condition.",
  category: ZoeNodeCategory.Control,
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
      key: "condition",
      label: "Condition",
      kind: ZoeAttributeKind.Expression,
      description: "Boolean expression to route the flow.",
      placeholder: "input.score > 0.5",
    },
  ],
  inputPorts: [
    {
      id: "in",
      label: "In",
      direction: ZoePortDirection.Input,
    },
  ],
  outputPorts: [
    {
      id: "then",
      label: "If",
      direction: ZoePortDirection.Output,
    },
    {
      id: "else",
      label: "Else",
      direction: ZoePortDirection.Output,
    },
  ],
  createData: createIfElseNodeData,
};
