import {
  TOOL_DEFAULTS,
  TOOL_RAG_DEFAULTS,
} from "@/zoeflow/nodes/shared/defaults";
import {
  getDeveloperToolDefinition,
  listDeveloperToolDefinitions,
} from "@/zoeflow/nodes/tool/developer";
import {
  ZoeAttributeKind,
  ZoeNodeCategory,
  ZoeNodeID,
  ZoePortDirection,
  type ZoeNodeDefinition,
  type ZoeToolNodeData,
} from "@/zoeflow/types";

const DEFAULT_TOOL_KEY: ZoeToolNodeData["toolKey"] = TOOL_DEFAULTS.toolKey;
const toolDefinition = getDeveloperToolDefinition(DEFAULT_TOOL_KEY);

/**
 * Build the label used for tool nodes when rendered inside the graph canvas.
 *
 * @param data - Tool node data.
 */
function getToolCanvasLabel(data: ZoeToolNodeData) {
  const definition = getDeveloperToolDefinition(data.toolKey);
  return definition?.label ?? "Tool";
}

/**
 * Create default data for the Tool node.
 */
export function createToolNodeData(): ZoeToolNodeData {
  return {
    type: ZoeNodeID.Tool,
    title: toolDefinition?.label ?? "Tool",
    label: "",
    toolKey: DEFAULT_TOOL_KEY,
    ragStoreId: TOOL_RAG_DEFAULTS.storeId,
    ragEmbeddingModel: TOOL_RAG_DEFAULTS.embeddingModel,
    ragMaxQueries: TOOL_RAG_DEFAULTS.maxQueries,
    ragTopK: TOOL_RAG_DEFAULTS.topK,
    ragMinScore: TOOL_RAG_DEFAULTS.minScore,
  };
}

export const toolNodeDefinition: ZoeNodeDefinition<ZoeToolNodeData> = {
  type: ZoeNodeID.Tool,
  label: "Tool",
  description:
    "Base tool node (abstract). Use specialized tool nodes (Coin Flip, RAG, Read Document) instead.",
  category: ZoeNodeCategory.Tool,
  getCanvasLabel: getToolCanvasLabel,
  allowUserCreate: false,
  requiredCount: null,
  attributes: [
    {
      key: "toolKey",
      label: "Tool",
      kind: ZoeAttributeKind.Select,
      description:
        "Select the developer tool exposed to connected Completion nodes.",
      options: listDeveloperToolDefinitions()
        .map((definition) => ({
          label: definition.label,
          value: definition.key,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    },
    {
      key: "label",
      label: "Label",
      kind: ZoeAttributeKind.Text,
      description: "Optional label for this node.",
      placeholder: "",
    },
    {
      key: "ragStoreId",
      label: "RAG store id",
      kind: ZoeAttributeKind.Text,
      description: "Vector store id to query on the server.",
      placeholder: TOOL_RAG_DEFAULTS.storeId,
      exposed: (data) =>
        data.type === ZoeNodeID.Tool && data.toolKey === ZoeNodeID.Rag,
    },
    {
      key: "ragEmbeddingModel",
      label: "RAG embedding model",
      kind: ZoeAttributeKind.Text,
      description:
        "Optional OpenRouter embedding model (falls back to server default when empty).",
      placeholder: "e.g. openai/text-embedding-3-small",
      exposed: (data) =>
        data.type === ZoeNodeID.Tool && data.toolKey === ZoeNodeID.Rag,
    },
    {
      key: "ragMaxQueries",
      label: "RAG max queries",
      kind: ZoeAttributeKind.Number,
      description: "Maximum number of natural-language queries per tool call.",
      min: 1,
      max: 20,
      exposed: (data) =>
        data.type === ZoeNodeID.Tool && data.toolKey === ZoeNodeID.Rag,
    },
    {
      key: "ragTopK",
      label: "RAG top K",
      kind: ZoeAttributeKind.Number,
      description: "How many results to return per query (max 5).",
      min: 1,
      max: 5,
      exposed: (data) =>
        data.type === ZoeNodeID.Tool && data.toolKey === ZoeNodeID.Rag,
    },
    {
      key: "ragMinScore",
      label: "RAG min score",
      kind: ZoeAttributeKind.Number,
      description: "Minimum similarity score required for a result to pass.",
      min: 0,
      max: 1,
      exposed: (data) =>
        data.type === ZoeNodeID.Tool && data.toolKey === ZoeNodeID.Rag,
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
  createData: createToolNodeData,
};
