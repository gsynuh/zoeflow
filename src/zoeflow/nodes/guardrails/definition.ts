import {
  ZoeAttributeKind,
  ZoeNodeCategory,
  ZoeNodeID,
  ZoePortDirection,
  type ZoeGuardrailsNodeData,
  type ZoeNodeDefinition,
} from "@/zoeflow/types";

import { GUARDRAILS_DEFAULTS } from "@/zoeflow/nodes/shared/defaults";

/**
 * Create default data for the Guardrails node.
 */
export function createGuardrailsNodeData(): ZoeGuardrailsNodeData {
  return {
    type: ZoeNodeID.Guardrails,
    title: "Guardrails",
    label: "",
    guardrailsHarmToOthers: GUARDRAILS_DEFAULTS.harmToOthers,
    guardrailsHarmToSelf: GUARDRAILS_DEFAULTS.harmToSelf,
    guardrailsHarmToSystem: GUARDRAILS_DEFAULTS.harmToSystem,
  };
}

export const guardrailsNodeDefinition: ZoeNodeDefinition<ZoeGuardrailsNodeData> =
  {
    type: ZoeNodeID.Guardrails,
    label: "Guardrails",
    description: "Evaluate the input payload against a set of guardrails.",
    category: ZoeNodeCategory.Agent,
    externalCall: true,
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
        key: "guardrailsHarmToOthers",
        label: "Harm to others",
        kind: ZoeAttributeKind.Toggle,
        description:
          "Block harassment, hate, illegal content, and other harm directed at others.",
      },
      {
        key: "guardrailsHarmToSelf",
        label: "Harm to self",
        kind: ZoeAttributeKind.Toggle,
        description:
          "Block self-harm and suicide encouragement or instructions.",
      },
      {
        key: "guardrailsHarmToSystem",
        label: "Harm to the system",
        kind: ZoeAttributeKind.Toggle,
        description:
          "Block prompt-injection attempts, coercion of tool calls, and attempts to bypass policies/tools/instructions.",
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
        id: "pass",
        label: "Pass",
        direction: ZoePortDirection.Output,
      },
      {
        id: "fail",
        label: "Fail",
        direction: ZoePortDirection.Output,
      },
    ],
    createData: createGuardrailsNodeData,
  };
