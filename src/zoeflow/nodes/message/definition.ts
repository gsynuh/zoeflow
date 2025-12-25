import { MessageCircleDashed } from "lucide-react";

import {
  ZoeAttributeKind,
  ZoeLLMRole,
  ZoeNodeCategory,
  ZoeNodeID,
  ZoePortDirection,
  type ZoeMessageNodeData,
  type ZoeNodeDefinition,
} from "@/zoeflow/types";

import { MESSAGE_DEFAULTS } from "@/zoeflow/nodes/shared/defaults";

/**
 * Format the message role into a user-friendly label for the node title.
 *
 * @param role - Role stored in the message node data.
 */
function formatMessageRoleLabel(role: ZoeMessageNodeData["role"]) {
  if (role === ZoeLLMRole.User) return "User";
  if (role === ZoeLLMRole.Assistant) return "Assistant";
  return "System";
}

/**
 * Build the label used for message nodes when rendered inside the graph canvas.
 *
 * @param data - Message node data.
 */
function getMessageCanvasLabel(data: ZoeMessageNodeData) {
  return `${formatMessageRoleLabel(data.role)} Message`;
}

/**
 * Create default data for the Message node.
 */
export function createMessageNodeData(): ZoeMessageNodeData {
  return {
    type: ZoeNodeID.Message,
    title: "Message",
    label: "",
    priority: MESSAGE_DEFAULTS.priority,
    role: MESSAGE_DEFAULTS.role,
    text: MESSAGE_DEFAULTS.text,
  };
}

export const messageNodeDefinition: ZoeNodeDefinition<ZoeMessageNodeData> = {
  type: ZoeNodeID.Message,
  label: "Message",
  description: "Append a message to a completion node.",
  category: ZoeNodeCategory.Constant,
  icon: MessageCircleDashed,
  getCanvasLabel: getMessageCanvasLabel,
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
      key: "priority",
      label: "Priority",
      kind: ZoeAttributeKind.Number,
      description: "Lower values are inserted earlier in the messages list.",
      min: -100,
      max: 100,
    },
    {
      key: "role",
      label: "Role",
      kind: ZoeAttributeKind.Select,
      description: "Role for this message.",
      options: [
        { label: "System", value: ZoeLLMRole.System },
        { label: "User", value: ZoeLLMRole.User },
        { label: "Assistant", value: ZoeLLMRole.Assistant },
      ],
    },
    {
      key: "text",
      label: "Text",
      kind: ZoeAttributeKind.Text,
      multiline: true,
      description: "Message content appended into the completion messages.",
      placeholder: "Enter message...",
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
  createData: createMessageNodeData,
};
