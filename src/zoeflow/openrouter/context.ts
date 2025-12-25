import type {
  OpenRouterMessage,
  OpenRouterToolCall,
} from "@/zoeflow/openrouter/types";
import { ZoeLLMRole } from "@/zoeflow/types";

export type ConversationEntry = {
  role: ZoeLLMRole;
  content: string;
  toolCalls?: OpenRouterToolCall[];
  toolCallId?: string;
};

export type ContextMessageEntry = {
  role: ZoeLLMRole;
  content: string;
  priority: number;
  sourceNodeId?: string;
  fragmentId?: string; // Unique identifier for the fragment
  originalText?: string; // Original text of the fragment
  embedding?: number[]; // Optional embedding for similarity checks
  isRagFragment?: boolean; // Flag to indicate if this is a RAG fragment
  toolCalls?: OpenRouterToolCall[];
  toolCallId?: string;
};

export type CompletionContextInput = {
  systemPrompt?: string;
  contextMessages?: ContextMessageEntry[];
  userMessage: string;
  conversation: ConversationEntry[];
  includeConversation: boolean;
  includeUserMessage?: boolean;
};

/**
 * Build OpenRouter messages for a completion request.
 */
export function buildCompletionMessages(
  input: CompletionContextInput,
): OpenRouterMessage[] {
  const messages: OpenRouterMessage[] = [];
  const includeUserMessage = input.includeUserMessage !== false;

  if (input.systemPrompt && input.systemPrompt.trim().length > 0) {
    messages.push({ role: ZoeLLMRole.System, content: input.systemPrompt });
  }

  if (input.contextMessages && input.contextMessages.length > 0) {
    input.contextMessages.forEach((entry) => {
      messages.push({
        role: entry.role,
        content: entry.content,
        tool_calls: entry.toolCalls,
        tool_call_id: entry.toolCallId,
      });
    });
  }

  if (input.includeConversation) {
    input.conversation.forEach((entry) => {
      messages.push({
        role: entry.role,
        content: entry.content,
        tool_calls: entry.toolCalls,
        tool_call_id: entry.toolCallId,
      });
    });
  }

  if (includeUserMessage) {
    messages.push({ role: ZoeLLMRole.User, content: input.userMessage });
  }
  return messages;
}
