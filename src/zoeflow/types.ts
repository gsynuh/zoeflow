import type React from "react";

export enum ZoeNodeID {
  Start = "start",
  End = "end",
  Completion = "completion",
  Guardrails = "guardrails",
  Message = "message",
  Tool = "tool",
  Rag = "rag",
  CoinFlip = "coinFlip",
  DiceRoll = "diceRoll",
  ReadDocument = "readDocument",
  Transform = "transform",
  Redact = "redact",
  IfElse = "ifElse",
  Switch = "switch",
  SetVariable = "setVariable",
  GetVariable = "getVariable",
  GlobalState = "globalState",
}

export enum ZoeNodeCategory {
  Boundaries = "boundaries",
  Control = "control",
  Constant = "constant",
  Function = "function",
  Agent = "agent",
  Tool = "tool",
}

export enum ZoeLLMRole {
  System = "system",
  User = "user",
  Assistant = "assistant",
  Tool = "tool",
}

export type ZoeNodeBaseData = {
  type: ZoeNodeID;
  title: string;
  label: string;
  muted?: boolean;
};

export type ZoeStartNodeData = ZoeNodeBaseData & {
  type: ZoeNodeID.Start;
  defaultUserPrompt: string;
};

export type ZoeCompletionNodeData = ZoeNodeBaseData & {
  type: ZoeNodeID.Completion;
  model: string;
  temperature: number;
  includeConversation: boolean;
  systemPrompt: string;
  useTools: boolean;
  toolsJson: string;
  toolChoiceJson: string;
};

export type ZoeGuardrailsNodeData = ZoeNodeBaseData & {
  type: ZoeNodeID.Guardrails;
  guardrailsHarmToOthers: boolean;
  guardrailsHarmToSelf: boolean;
  guardrailsHarmToSystem: boolean;
};

export type ZoeMessageNodeData = ZoeNodeBaseData & {
  type: ZoeNodeID.Message;
  priority: number;
  role: ZoeLLMRole;
  text: string;
};

/**
 * Node IDs that can be used as developer tools.
 * These correspond to nodes that expose tools to Completion nodes.
 */
export type ZoeToolNodeID =
  | ZoeNodeID.CoinFlip
  | ZoeNodeID.DiceRoll
  | ZoeNodeID.Rag
  | ZoeNodeID.ReadDocument
  | ZoeNodeID.GlobalState;

export type ZoeToolNodeData = ZoeNodeBaseData & {
  type: ZoeNodeID.Tool;
  toolKey: ZoeToolNodeID;
  ragStoreId: string;
  ragEmbeddingModel: string;
  ragMaxQueries: number;
  ragTopK: number;
  ragMinScore: number;
};

export type ZoeRagNodeData = ZoeNodeBaseData & {
  type: ZoeNodeID.Rag;
  storeId: string;
  embeddingModel: string;
  maxQueries: number;
  topK: number;
  minScore: number;
  queryGuidance: string;
};

export type ZoeCoinFlipNodeData = ZoeNodeBaseData & {
  type: ZoeNodeID.CoinFlip;
};

export type ZoeDiceRollNodeData = ZoeNodeBaseData & {
  type: ZoeNodeID.DiceRoll;
};

export type ZoeReadDocumentNodeData = ZoeNodeBaseData & {
  type: ZoeNodeID.ReadDocument;
};

export type ZoeTransformNodeData = ZoeNodeBaseData & {
  type: ZoeNodeID.Transform;
  expression: string;
};

export type ZoeRedactNodeData = ZoeNodeBaseData & {
  type: ZoeNodeID.Redact;
  redactEmails: boolean;
  redactApiKeys: boolean;
  redactSdkKeys: boolean;
  placeholderFormat: ZoeRedactionPlaceholderFormat;
  replacement: string;
};

export type ZoeIfElseNodeData = ZoeNodeBaseData & {
  type: ZoeNodeID.IfElse;
  condition: string;
};

export type ZoeSwitchNodeData = ZoeNodeBaseData & {
  type: ZoeNodeID.Switch;
  expression: string;
  cases: number;
  caseLabels: string;
};

export type ZoeSetVariableNodeData = ZoeNodeBaseData & {
  type: ZoeNodeID.SetVariable;
  path: string;
  value: string;
};

export type ZoeGetVariableNodeData = ZoeNodeBaseData & {
  type: ZoeNodeID.GetVariable;
  path: string;
};

export type ZoeGlobalStateNodeData = ZoeNodeBaseData & {
  type: ZoeNodeID.GlobalState;
  instructions?: string;
};

export type ZoeEndNodeData = ZoeNodeBaseData & {
  type: ZoeNodeID.End;
};

export type ZoeNodeData =
  | ZoeStartNodeData
  | ZoeCompletionNodeData
  | ZoeGuardrailsNodeData
  | ZoeMessageNodeData
  | ZoeToolNodeData
  | ZoeRagNodeData
  | ZoeCoinFlipNodeData
  | ZoeDiceRollNodeData
  | ZoeReadDocumentNodeData
  | ZoeTransformNodeData
  | ZoeRedactNodeData
  | ZoeIfElseNodeData
  | ZoeSwitchNodeData
  | ZoeSetVariableNodeData
  | ZoeGetVariableNodeData
  | ZoeGlobalStateNodeData
  | ZoeEndNodeData;

export enum ZoePortDirection {
  Input = "input",
  Output = "output",
}

export type ZoePortDefinition = {
  id: string;
  label: string;
  direction: ZoePortDirection;
};

export type ZoePortResolver<TData extends ZoeNodeData> =
  | Array<ZoePortDefinition>
  | {
      bivarianceHack(data: TData): Array<ZoePortDefinition>;
    }["bivarianceHack"];

export enum ZoeAttributeKind {
  Text = "text",
  Number = "number",
  Toggle = "toggle",
  Select = "select",
  Expression = "expression",
  Json = "json",
}

export enum ZoeRedactionPlaceholderFormat {
  Generic = "generic",
  Typed = "typed",
}

export type ZoeAttributeOption = {
  label: string;
  value: string;
};

export type ZoeAttributeDefinition<TData extends ZoeNodeData> = {
  key: keyof TData & string;
  label: string;
  kind: ZoeAttributeKind;
  description?: string;
  placeholder?: string;
  multiline?: boolean;
  exposed?: boolean | ((data: TData) => boolean);
  editable?: boolean;
  min?: number;
  max?: number;
  options?: ZoeAttributeOption[];
};

export type ZoeNodeDefinition<TData extends ZoeNodeData> = {
  type: TData["type"];
  label: string;
  description?: string;
  category: ZoeNodeCategory;
  /**
   * Indicates this node will call an external API (ex: an LLM completion).
   */
  externalCall?: boolean;
  /**
   * Optional custom icon component to display in the node badge.
   * When provided, overrides the default category-based icon logic.
   * Should be a lucide-react icon component (e.g., Database, Brain, etc.).
   */
  icon?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  /**
   * Optional label override for rendering inside the graph canvas.
   *
   * Defaults to {@link ZoeNodeDefinition.label} when omitted.
   */
  getCanvasLabel?: (data: TData) => string;
  /**
   * Whether the user-defined label should be displayed on the node in the canvas.
   *
   * Defaults to true when omitted.
   */
  showUserLabelOnCanvas?: boolean;
  allowUserCreate: boolean;
  requiredCount: number | null;
  attributes: Array<ZoeAttributeDefinition<TData>>;
  inputPorts: Array<ZoePortDefinition>;
  outputPorts: ZoePortResolver<TData>;
  createData: () => TData;
};

export type ZoeNodeDataByType<TType extends ZoeNodeID> = Extract<
  ZoeNodeData,
  { type: TType }
>;

export type ZoeNodeDefinitionMap = {
  [TType in ZoeNodeID]: ZoeNodeDefinition<ZoeNodeDataByType<TType>>;
};

export type ZoeNodeDefinitionUnion = ZoeNodeDefinitionMap[ZoeNodeID];

export type ZoeNodeDataPatch = Partial<ZoeNodeData> & { cases?: number };

export type ZoeNode = {
  id: string;
  type: ZoeNodeID;
  data: ZoeNodeData;
};

export type ZoeEdge = {
  id: string;
  source: string;
  target: string;
  sourcePort?: string;
  targetPort?: string;
};

export type ZoeGraph = {
  nodes: ZoeNode[];
  edges: ZoeEdge[];
};
