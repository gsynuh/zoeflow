import type { ZoeEvaluationContext } from "@/zoeflow/engine/evaluator";
import type { ZoeExpressionScope } from "@/zoeflow/engine/expression";
import type {
  ContextMessageEntry,
  ConversationEntry,
} from "@/zoeflow/openrouter/context";
import type {
  ZoeEdge,
  ZoeGraph,
  ZoeNode,
  ZoeNodeData,
  ZoeNodeDataByType,
  ZoeNodeID,
} from "@/zoeflow/types";

export enum ZoeAssistantVariant {
  Standard = "standard",
  Trace = "trace",
  Internal = "internal",
}

export type ZoeAssistantUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost?: number;
  upstreamCost?: number;
};

export type ZoeRunCallbacks = {
  onTrace: (message: string) => void;
  onTraceEvent?: (event: {
    nodeId: string;
    nodeType: ZoeNodeID;
    message: string;
  }) => void;
  onNodeStart?: (event: { nodeId: string; nodeType: ZoeNodeID }) => void;
  onAssistantStart: (options: {
    name: string;
    variant: ZoeAssistantVariant;
    nodeId: string;
    modelId?: string;
  }) => string;
  onAssistantUpdate: (messageId: string, content: string) => void;
  onAssistantUsage?: (messageId: string, usage: ZoeAssistantUsage) => void;
  onNodeFinish?: (event: {
    nodeId: string;
    nodeType: ZoeNodeID;
    nextNodeId: string | null;
    nextPort?: string;
    stop: boolean;
    state: ZoeExecutionState;
  }) => void;
};

export type ZoeRunOptions = {
  graph: ZoeGraph;
  userMessage?: string;
  conversation?: ConversationEntry[];
  initialVars?: Record<string, unknown>;
  startEdgeId?: string;
  startNodeId?: string;
  initialState?: ZoeExecutionState;
  endpoint?: string;
  signal?: AbortSignal;
  onAbort?: () => void;
  callbacks: ZoeRunCallbacks;
};

export type ZoeExecutionState = {
  payload: unknown;
  contextMessages: ContextMessageEntry[];
  vars: Record<string, unknown>;
  conversation: ConversationEntry[];
  nodeOutputs: Map<string, unknown>;
};

export type ZoeExecutionRuntime = {
  endpoint: string;
  signal?: AbortSignal;
  callbacks: ZoeRunCallbacks;
};

export type ZoeNodeExecutionContext = {
  node: ZoeNode;
  state: ZoeExecutionState;
  scope: ZoeExpressionScope;
  contextMessages: ContextMessageEntry[];
  nodesById: Map<string, ZoeNode>;
  edgesByTarget: Map<string, ZoeEdge[]>;
  evaluationContext: ZoeEvaluationContext;
  runtime: ZoeExecutionRuntime;
};

export type ZoeNodeExecutionResult = {
  nextPort?: string;
  stop?: boolean;
};

export type ZoeNodeExecutor<TData extends ZoeNodeData> = {
  execute: (
    context: ZoeNodeExecutionContext,
    data: TData,
  ) => Promise<ZoeNodeExecutionResult | void>;
};

export type ZoeNodeExecutorMap = {
  [TType in ZoeNodeID]: ZoeNodeExecutor<ZoeNodeDataByType<TType>>;
};
