import type { Edge } from "@xyflow/react";

import {
  createReactFlowNode,
  type ZoeReactFlowNode,
} from "@/zoeflow/adapters/reactflow";
import { ZoeNodeID } from "@/zoeflow/types";

export const initialNodes: ZoeReactFlowNode[] = [
  createReactFlowNode({
    id: "start",
    type: ZoeNodeID.Start,
    position: { x: -96, y: 96 },
    data: {
      defaultUserPrompt: "Describe your request.\n",
    },
  }),
  createReactFlowNode({
    id: "llm",
    type: ZoeNodeID.Completion,
    position: { x: 0, y: 96 },
    data: {
      label: "Assistant",
      model: "openai/gpt-4o-mini",
      temperature: 0.4,
      includeConversation: true,
      systemPrompt: "You are a helpful assistant.\n",
      useTools: false,
      toolsJson: "",
      toolChoiceJson: "",
    },
  }),
  createReactFlowNode({
    id: "end",
    type: ZoeNodeID.End,
    position: { x: 176, y: 96 },
  }),
];

export const initialEdges: Edge[] = [
  {
    id: "edge-start-llm",
    source: "start",
    sourceHandle: "out",
    target: "llm",
    targetHandle: "in",
    animated: true,
  },
  {
    id: "edge-llm-end",
    source: "llm",
    sourceHandle: "out",
    target: "end",
    targetHandle: "in",
    animated: true,
  },
];
