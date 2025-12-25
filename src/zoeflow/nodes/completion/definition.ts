import {
  ZoeAttributeKind,
  ZoeNodeCategory,
  ZoeNodeID,
  ZoePortDirection,
  type ZoeCompletionNodeData,
  type ZoeNodeDefinition,
} from "@/zoeflow/types";

import defaultInstructions from "@/content/nodes/completion/instructions.md";
import { COMPLETION_DEFAULTS } from "@/zoeflow/nodes/shared/defaults";

/**
 * Create default data for the Completion node.
 */
export function createCompletionNodeData(): ZoeCompletionNodeData {
  return {
    type: ZoeNodeID.Completion,
    title: "Completion",
    label: "",
    model: COMPLETION_DEFAULTS.model,
    temperature: COMPLETION_DEFAULTS.temperature,
    includeConversation: COMPLETION_DEFAULTS.includeConversation,
    systemPrompt: defaultInstructions,
    useTools: COMPLETION_DEFAULTS.useTools,
    toolsJson: COMPLETION_DEFAULTS.toolsJson,
    toolChoiceJson: COMPLETION_DEFAULTS.toolChoiceJson,
  };
}

export const completionNodeDefinition: ZoeNodeDefinition<ZoeCompletionNodeData> =
  {
    type: ZoeNodeID.Completion,
    label: "Completion",
    description: "Generate a response using an LLM.",
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
        key: "model",
        label: "Model",
        kind: ZoeAttributeKind.Text,
        description: "",
        placeholder: "openai/gpt-4o-mini",
      },
      {
        key: "temperature",
        label: "Temperature",
        kind: ZoeAttributeKind.Number,
        description: "",
        min: 0,
        max: 2,
      },
      {
        key: "includeConversation",
        label: "Include conversation",
        kind: ZoeAttributeKind.Toggle,
        description: "Include chat history when building context.",
      },
      {
        key: "systemPrompt",
        label: "System instructions",
        kind: ZoeAttributeKind.Text,
        multiline: true,
        description: "",
        placeholder: "You are a helpful assistant.",
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
    createData: createCompletionNodeData,
  };
