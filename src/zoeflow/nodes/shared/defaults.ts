import {
  ZoeLLMRole,
  ZoeNodeID,
  ZoeRedactionPlaceholderFormat,
  type ZoeToolNodeID,
} from "@/zoeflow/types";

/**
 * Shared defaults for node/tool configuration.
 *
 * This file exists to prevent scattered "magic numbers" across:
 * - `create*NodeData()` factories
 * - tool execution fallbacks (when input data is missing/invalid)
 * - tool schemas sent to providers (OpenRouter)
 *
 * These defaults should match what a newly-created node starts with, and serve as
 * the single source of truth for runtime fallbacks.
 */

export const ZOE_DEFAULT_STORE_ID = "default";

export const COMPLETION_DEFAULTS = {
  nodeType: ZoeNodeID.Completion,
  model: "openai/gpt-4o-mini",
  temperature: 0.4,
  includeConversation: false,
  useTools: false,
  toolsJson: "",
  toolChoiceJson: "",
} as const;

export const GUARDRAILS_DEFAULTS = {
  nodeType: ZoeNodeID.Guardrails,
  harmToOthers: true,
  harmToSelf: true,
  harmToSystem: true,
} as const;

export const MESSAGE_DEFAULTS = {
  nodeType: ZoeNodeID.Message,
  priority: 0,
  role: ZoeLLMRole.System,
  text: "",
} as const;

export const RAG_DEFAULTS = {
  nodeType: ZoeNodeID.Rag,
  storeId: ZOE_DEFAULT_STORE_ID,
  embeddingModel: "",
  maxQueries: 4,
  topK: 4,
  minScore: 0.4,
  maxQueriesCap: 8,
} as const;

export const TOOL_RAG_DEFAULTS = {
  nodeType: ZoeNodeID.Tool,
  storeId: ZOE_DEFAULT_STORE_ID,
  embeddingModel: "",
  maxQueries: RAG_DEFAULTS.maxQueries,
  topK: RAG_DEFAULTS.topK,
  minScore: RAG_DEFAULTS.minScore,
} as const;

export const TOOL_DEFAULTS = {
  nodeType: ZoeNodeID.Tool,
  toolKey: ZoeNodeID.CoinFlip as ZoeToolNodeID,
} as const;

export const IF_ELSE_DEFAULTS = {
  nodeType: ZoeNodeID.IfElse,
  condition: "input.score > 0.5",
} as const;

export const SWITCH_DEFAULTS = {
  nodeType: ZoeNodeID.Switch,
  minCases: 2,
  maxCases: 8,
  cases: 3,
  expression: "input.category",
  caseLabels: "Case 1\nCase 2\nCase 3",
} as const;

export const SET_VARIABLE_DEFAULTS = {
  nodeType: ZoeNodeID.SetVariable,
  path: "",
  value: "",
} as const;

export const GET_VARIABLE_DEFAULTS = {
  nodeType: ZoeNodeID.GetVariable,
  path: "",
} as const;

export const TRANSFORM_DEFAULTS = {
  nodeType: ZoeNodeID.Transform,
  expression: "return input;",
} as const;

export const REDACT_DEFAULTS = {
  nodeType: ZoeNodeID.Redact,
  redactEmails: true,
  redactApiKeys: true,
  redactSdkKeys: true,
  placeholderFormat: ZoeRedactionPlaceholderFormat.Typed,
  replacement: "[REDACTED]",
} as const;

export const START_DEFAULTS = {
  nodeType: ZoeNodeID.Start,
  title: "Start",
} as const;

export const END_DEFAULTS = {
  nodeType: ZoeNodeID.End,
  title: "End",
} as const;

export const COIN_FLIP_DEFAULTS = {
  nodeType: ZoeNodeID.CoinFlip,
  title: "Coin Flip",
} as const;

export const DICE_ROLL_DEFAULTS = {
  nodeType: ZoeNodeID.DiceRoll,
  title: "Dice Roll",
} as const;

export const READ_DOCUMENT_DEFAULTS = {
  nodeType: ZoeNodeID.ReadDocument,
  title: "Read File",
} as const;

export const GLOBAL_STATE_DEFAULTS = {
  nodeType: ZoeNodeID.GlobalState,
  title: "Global State",
  instructions: "",
} as const;
