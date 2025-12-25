import type { OpenRouterTool } from "@/zoeflow/openrouter/types";
import type {
  ZoeCoinFlipNodeData,
  ZoeDiceRollNodeData,
  ZoeGlobalStateNodeData,
  ZoeRagNodeData,
  ZoeReadDocumentNodeData,
  ZoeToolNodeData,
  ZoeToolNodeID,
} from "@/zoeflow/types";

export type ZoeDeveloperToolExecutionResult = {
  nodeId: string;
  message: string;
  value?: unknown;
};

export type ZoeDeveloperToolExecuteInput = {
  data:
    | ZoeToolNodeData
    | ZoeRagNodeData
    | ZoeCoinFlipNodeData
    | ZoeDiceRollNodeData
    | ZoeReadDocumentNodeData
    | ZoeGlobalStateNodeData;
  toolCall: {
    name: string;
    arguments: unknown;
  };
};

export type ZoeDeveloperToolDefinition = {
  key: ZoeToolNodeID;
  label: string;
  description: string;
  openRouterTool: OpenRouterTool;
  execute: (input: ZoeDeveloperToolExecuteInput) => Promise<{
    message: string;
    value?: unknown;
  }>;
};
