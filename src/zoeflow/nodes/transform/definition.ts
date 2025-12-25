import {
  ZoeAttributeKind,
  ZoeNodeCategory,
  ZoeNodeID,
  ZoePortDirection,
  type ZoeNodeDefinition,
  type ZoeTransformNodeData,
} from "@/zoeflow/types";

import { TRANSFORM_DEFAULTS } from "@/zoeflow/nodes/shared/defaults";

/**
 * Create default data for the Transform node.
 */
export function createTransformNodeData(): ZoeTransformNodeData {
  return {
    type: ZoeNodeID.Transform,
    title: "Transform",
    label: "",
    expression: TRANSFORM_DEFAULTS.expression,
  };
}

export const transformNodeDefinition: ZoeNodeDefinition<ZoeTransformNodeData> =
  {
    type: ZoeNodeID.Transform,
    label: "Transform",
    description:
      "Run a custom JavaScript function body over the input payload.",
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
        key: "expression",
        label: "Function body",
        kind: ZoeAttributeKind.Expression,
        description: "JavaScript function body that returns a new payload.",
        placeholder: "const next = { ...input, updated: true };\nreturn next;",
        multiline: true,
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
        id: "out",
        label: "Out",
        direction: ZoePortDirection.Output,
      },
    ],
    createData: createTransformNodeData,
  };
