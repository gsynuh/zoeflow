import type { ZoeLLMRole } from "@/zoeflow/types";

export type OpenRouterFunctionCall = {
  name: string;
  arguments?: string;
};

export type OpenRouterToolCall = {
  id?: string;
  type: "function";
  function: {
    name: string;
    arguments?: string;
  };
};

export type OpenRouterMessage = {
  role: ZoeLLMRole;
  content: string | null;
  tool_calls?: OpenRouterToolCall[];
  tool_call_id?: string;
  /**
   * Legacy single-function call shape supported by some providers/models.
   */
  function_call?: OpenRouterFunctionCall;
};

export type OpenRouterToolFunction = {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
};

export type OpenRouterTool = {
  type: "function";
  function: OpenRouterToolFunction;
};

export type OpenRouterToolChoice =
  | "auto"
  | "none"
  | { type: "function"; function: { name: string } };

export type OpenRouterCompletionRequest = {
  model: string;
  messages: OpenRouterMessage[];
  temperature?: number;
  stream?: boolean;
  tools?: OpenRouterTool[];
  tool_choice?: OpenRouterToolChoice;
  usage?: {
    include: boolean;
  };
};

export type OpenRouterCompletionChoice = {
  message: OpenRouterMessage;
};

export type OpenRouterUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  completion_tokens_details?: {
    reasoning_tokens?: number;
  };
  cost?: number;
  cost_details?: {
    upstream_inference_cost?: number;
  };
};

export type OpenRouterCompletionResponse = {
  id: string;
  model: string;
  choices: OpenRouterCompletionChoice[];
  usage?: OpenRouterUsage;
};
