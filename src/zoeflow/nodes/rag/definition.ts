import { Database } from "lucide-react";

import {
  ZoeAttributeKind,
  ZoeNodeCategory,
  ZoeNodeID,
  ZoePortDirection,
  type ZoeNodeDefinition,
  type ZoeRagNodeData,
} from "@/zoeflow/types";

import { RAG_DEFAULTS } from "@/zoeflow/nodes/shared/defaults";

import defaultGuidance from "@/content/nodes/rag/query-guidance.md";

/**
 * Create default data for the RAG node.
 */
export function createRagNodeData(): ZoeRagNodeData {
  return {
    type: ZoeNodeID.Rag,
    title: "RAG",
    label: "",
    storeId: RAG_DEFAULTS.storeId,
    embeddingModel: RAG_DEFAULTS.embeddingModel,
    maxQueries: RAG_DEFAULTS.maxQueries,
    topK: RAG_DEFAULTS.topK,
    minScore: RAG_DEFAULTS.minScore,
    queryGuidance: defaultGuidance,
  };
}

export const ragNodeDefinition: ZoeNodeDefinition<ZoeRagNodeData> = {
  type: ZoeNodeID.Rag,
  label: "RAG",
  description:
    "Retrieval helper that provides a rag_search tool and query-writing guidance to connected Completion nodes.",
  category: ZoeNodeCategory.Tool,
  externalCall: true,
  icon: Database,
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
      key: "storeId",
      label: "Store id",
      kind: ZoeAttributeKind.Text,
      description: "Vector store id to query on the server.",
      placeholder: RAG_DEFAULTS.storeId,
    },
    {
      key: "maxQueries",
      label: "Max queries",
      kind: ZoeAttributeKind.Number,
      description: "Maximum number of natural-language queries per tool call.",
      min: 1,
      max: RAG_DEFAULTS.maxQueriesCap,
    },
    {
      key: "topK",
      label: "Top K",
      kind: ZoeAttributeKind.Number,
      description: "Maximum number of results per query.",
      min: 1,
      max: 5,
    },
    {
      key: "minScore",
      label: "Min score",
      kind: ZoeAttributeKind.Number,
      description: "Minimum similarity score required for a result to pass.",
      min: 0,
      max: 1,
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
  createData: createRagNodeData,
};
