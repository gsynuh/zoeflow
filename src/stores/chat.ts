import { atom } from "nanostores";

import type {
  ContextMessageEntry,
  ConversationEntry,
} from "@/zoeflow/openrouter/context";
import { estimateTokenCount } from "@/zoeflow/openrouter/tokenEstimate";
import { ZoeLLMRole, type ZoeNodeID } from "@/zoeflow/types";

export enum ChatRole {
  User = "user",
  Assistant = "assistant",
  App = "app",
}

export enum ChatMessageVariant {
  Standard = "standard",
  Trace = "trace",
  Internal = "internal",
}

export type ChatMessageUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost?: number;
  upstreamCost?: number;
};

export type ChatMessage = {
  id: string;
  at: number;
  role: ChatRole;
  content: string;
  name?: string;
  modelId?: string;
  tokenCount?: number;
  usage?: ChatMessageUsage;
  variant?: ChatMessageVariant;
  nodeId?: string;
  runId?: string;
};

export type ChatExecutionStateSnapshot = {
  payload: unknown;
  contextMessages: ContextMessageEntry[];
  vars: Record<string, unknown>;
  conversation: ConversationEntry[];
};

export type ChatThreadRunStep = {
  nodeId: string;
  nodeType: ZoeNodeID;
  nextNodeId: string | null;
  nextPort?: string;
  assistantMessageId?: string;
  state: ChatExecutionStateSnapshot;
};

export type ChatThreadRun = {
  id: string;
  createdAt: number;
  userMessage: string;
  baseConversation: ConversationEntry[];
  startEdgeId: string | null;
  steps: ChatThreadRunStep[];
};

export type ChatThread = {
  id: string;
  edgeId: string | null;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  runs: ChatThreadRun[];
};

const DEFAULT_CHAT_THREAD_ID = "primary";
const DEFAULT_CHAT_THREAD_TITLE = "Conversation";

/**
 * Create a new chat thread record.
 *
 * @param options - Optional overrides for the thread metadata.
 */
function createChatThreadRecord(options?: {
  id?: string;
  edgeId?: string | null;
  title?: string;
}): ChatThread {
  return {
    id: options?.id ?? crypto.randomUUID(),
    edgeId: options?.edgeId ?? null,
    title: options?.title ?? DEFAULT_CHAT_THREAD_TITLE,
    messages: [],
    createdAt: Date.now(),
    runs: [],
  };
}

export const $chatThreads = atom<ChatThread[]>([
  createChatThreadRecord({
    id: DEFAULT_CHAT_THREAD_ID,
    title: DEFAULT_CHAT_THREAD_TITLE,
  }),
]);
export const $activeChatThreadId = atom<string>(DEFAULT_CHAT_THREAD_ID);

/**
 * Reset the chat threads to a single empty conversation.
 */
export function resetChatThreads() {
  const thread = createChatThreadRecord({
    id: DEFAULT_CHAT_THREAD_ID,
    title: DEFAULT_CHAT_THREAD_TITLE,
  });
  $chatThreads.set([thread]);
  $activeChatThreadId.set(thread.id);
}

/**
 * Create a new chat thread.
 *
 * @param options - Optional metadata for the new thread.
 */
export function addChatThread(options?: {
  edgeId?: string | null;
  title?: string;
}) {
  const thread = createChatThreadRecord(options);
  $chatThreads.set([...$chatThreads.get(), thread]);
  return thread.id;
}

/**
 * Update the active chat thread id.
 *
 * @param threadId - Thread id to activate.
 */
export function setActiveChatThread(threadId: string) {
  $activeChatThreadId.set(threadId);
}

/**
 * Update the edge association for a chat thread.
 *
 * @param threadId - Thread to update.
 * @param edgeId - New edge id association.
 */
export function setChatThreadEdgeId(threadId: string, edgeId: string | null) {
  $chatThreads.set(
    $chatThreads.get().map((thread) => {
      if (thread.id !== threadId) return thread;
      return { ...thread, edgeId };
    }),
  );
}

/**
 * Remove a chat thread by id.
 *
 * @param threadId - Thread to remove.
 */
export function removeChatThread(threadId: string) {
  const remaining = $chatThreads
    .get()
    .filter((thread) => thread.id !== threadId);
  if (remaining.length === 0) {
    resetChatThreads();
    return;
  }
  $chatThreads.set(remaining);
  if ($activeChatThreadId.get() === threadId) {
    $activeChatThreadId.set(remaining[0].id);
  }
}

/**
 * Append a chat message to a thread.
 *
 * @param threadId - Thread id to update.
 * @param role - Role for the message.
 * @param content - Message content.
 * @param options - Optional metadata for the message.
 */
export function appendChatMessage(
  threadId: string,
  role: ChatRole,
  content: string,
  options?: {
    name?: string;
    modelId?: string;
    variant?: ChatMessageVariant;
    nodeId?: string;
    runId?: string;
    tokenCount?: number;
    usage?: ChatMessageUsage;
  },
) {
  const id = crypto.randomUUID();

  const tokenCount =
    options?.tokenCount ??
    (options?.usage
      ? options.usage.totalTokens
      : role === ChatRole.User
        ? undefined
        : estimateTokenCount(content));
  $chatThreads.set(
    $chatThreads.get().map((thread) => {
      if (thread.id !== threadId) return thread;
      return {
        ...thread,
        messages: [
          ...thread.messages,
          {
            id,
            at: Date.now(),
            role,
            content,
            name: options?.name,
            modelId: options?.modelId,
            tokenCount,
            usage: options?.usage,
            variant: options?.variant,
            nodeId: options?.nodeId,
            runId: options?.runId,
          },
        ],
      };
    }),
  );
  return id;
}

/**
 * Create a new run record for a chat thread.
 *
 * @param threadId - Thread id to update.
 * @param input - Run metadata to persist.
 */
export function startChatThreadRun(
  threadId: string,
  input: {
    id: string;
    userMessage: string;
    baseConversation: ConversationEntry[];
    startEdgeId: string | null;
    createdAt?: number;
  },
) {
  const run: ChatThreadRun = {
    id: input.id,
    createdAt: input.createdAt ?? Date.now(),
    userMessage: input.userMessage,
    baseConversation: input.baseConversation,
    startEdgeId: input.startEdgeId,
    steps: [],
  };

  $chatThreads.set(
    $chatThreads.get().map((thread) => {
      if (thread.id !== threadId) return thread;
      return { ...thread, runs: [...thread.runs, run] };
    }),
  );

  return run.id;
}

/**
 * Append a node execution snapshot to a thread run.
 *
 * @param threadId - Thread id to update.
 * @param runId - Run record id to append into.
 * @param step - Step snapshot to append.
 */
export function appendChatThreadRunStep(
  threadId: string,
  runId: string,
  step: ChatThreadRunStep,
) {
  $chatThreads.set(
    $chatThreads.get().map((thread) => {
      if (thread.id !== threadId) return thread;
      return {
        ...thread,
        runs: thread.runs.map((run) => {
          if (run.id !== runId) return run;
          return { ...run, steps: [...run.steps, step] };
        }),
      };
    }),
  );
}

/**
 * Clear a chat thread conversation.
 *
 * @param threadId - Thread to clear.
 */
export function clearChatThreadMessages(threadId: string) {
  $chatThreads.set(
    $chatThreads.get().map((thread) => {
      if (thread.id !== threadId) return thread;
      return { ...thread, messages: [], runs: [] };
    }),
  );
}

/**
 * Update a single chat message by id.
 *
 * @param threadId - Thread id that owns the message.
 * @param id - Message id.
 * @param content - Updated message content.
 */
export function updateChatMessage(
  threadId: string,
  id: string,
  content: string,
) {
  const tokenCount = estimateTokenCount(content);
  $chatThreads.set(
    $chatThreads.get().map((thread) => {
      if (thread.id !== threadId) return thread;
      return {
        ...thread,
        messages: thread.messages.map((message) => {
          if (message.id !== id) return message;
          const usage = message.usage;
          return {
            ...message,
            content,
            usage,
            tokenCount: usage ? usage.totalTokens : tokenCount,
          };
        }),
      };
    }),
  );
}

/**
 * Update usage metadata for a chat message.
 *
 * @param threadId - Thread id that owns the message.
 * @param id - Message id.
 * @param usage - Usage payload to persist.
 */
export function updateChatMessageUsage(
  threadId: string,
  id: string,
  usage: ChatMessageUsage,
) {
  const threads = $chatThreads.get();
  const thread = threads.find((entry) => entry.id === threadId);
  const message = thread?.messages.find((entry) => entry.id === id);
  if (!thread || !message) {
    return;
  }

  $chatThreads.set(
    threads.map((entry) => {
      if (entry.id !== threadId) return entry;
      return {
        ...entry,
        messages: entry.messages.map((message) => {
          if (message.id !== id) return message;
          return { ...message, usage, tokenCount: usage.totalTokens };
        }),
      };
    }),
  );
}

/**
 * Update a chat message as an end-user edit, invalidating dependent run steps.
 *
 * @param threadId - Thread id that owns the message.
 * @param messageId - Message id to edit.
 * @param content - Updated message content.
 */
export function editChatMessage(
  threadId: string,
  messageId: string,
  content: string,
) {
  const tokenCount = estimateTokenCount(content);
  $chatThreads.set(
    $chatThreads.get().map((thread) => {
      if (thread.id !== threadId) return thread;

      const message = thread.messages.find((entry) => entry.id === messageId);
      if (!message) return thread;
      if (
        message.variant === ChatMessageVariant.Trace ||
        message.variant === ChatMessageVariant.Internal
      ) {
        return thread;
      }

      const updatedMessages = thread.messages.map((entry) => {
        if (entry.id !== messageId) return entry;
        return { ...entry, content, tokenCount, usage: undefined };
      });

      if (!message.runId) {
        return { ...thread, messages: updatedMessages, runs: [] };
      }

      const runIndex = thread.runs.findIndex((run) => run.id === message.runId);
      if (runIndex === -1) {
        return { ...thread, messages: updatedMessages, runs: [] };
      }

      const run = thread.runs[runIndex];
      const subsequentRunIds = thread.runs
        .slice(runIndex + 1)
        .map((entry) => entry.id);

      const stripSubsequentRunsMessages =
        subsequentRunIds.length === 0
          ? updatedMessages
          : updatedMessages.filter(
              (entry) =>
                !entry.runId || !subsequentRunIds.includes(entry.runId),
            );

      if (message.role === ChatRole.User) {
        const clearedRun: ChatThreadRun = {
          ...run,
          userMessage: content,
          steps: [],
        };

        const removedAssistantIds = run.steps
          .map((step) => step.assistantMessageId)
          .filter((id): id is string => typeof id === "string");
        const cleanedMessages = stripSubsequentRunsMessages.filter((entry) => {
          if (entry.id === messageId) return true;
          if (entry.runId !== run.id) return true;
          if (removedAssistantIds.includes(entry.id)) return false;
          if (entry.variant === ChatMessageVariant.Trace) return false;
          return entry.role === ChatRole.User;
        });

        return {
          ...thread,
          messages: cleanedMessages,
          runs: [...thread.runs.slice(0, runIndex), clearedRun],
        };
      }

      const stepIndex =
        message.role === ChatRole.Assistant && message.nodeId
          ? run.steps.findIndex(
              (step) =>
                step.nodeId === message.nodeId &&
                step.assistantMessageId === messageId,
            )
          : -1;

      if (stepIndex === -1) {
        return {
          ...thread,
          messages: stripSubsequentRunsMessages,
          runs: thread.runs.slice(0, runIndex),
        };
      }

      const truncatedSteps = run.steps.slice(0, stepIndex + 1);
      const lastStep = truncatedSteps[stepIndex];
      const conversation = [...lastStep.state.conversation];
      const lastConversationEntry = conversation[conversation.length - 1];
      const nextConversation =
        lastConversationEntry &&
        lastConversationEntry.role === ZoeLLMRole.Assistant
          ? [
              ...conversation.slice(0, conversation.length - 1),
              { ...lastConversationEntry, content },
            ]
          : conversation;
      const patchedStep: ChatThreadRunStep = {
        ...lastStep,
        state: {
          ...lastStep.state,
          payload: content,
          conversation: nextConversation,
        },
      };

      const removedAssistantIds = run.steps
        .slice(stepIndex + 1)
        .map((step) => step.assistantMessageId)
        .filter((id): id is string => typeof id === "string");
      const removedNodeIds = run.steps
        .slice(stepIndex + 1)
        .map((step) => step.nodeId);

      const cleanedMessages = stripSubsequentRunsMessages.filter((entry) => {
        if (entry.runId !== run.id) return true;
        if (entry.id === messageId) return true;
        if (removedAssistantIds.includes(entry.id)) return false;
        if (
          entry.variant === ChatMessageVariant.Trace &&
          entry.nodeId &&
          removedNodeIds.includes(entry.nodeId)
        ) {
          return false;
        }
        return true;
      });

      return {
        ...thread,
        messages: cleanedMessages,
        runs: [
          ...thread.runs.slice(0, runIndex),
          {
            ...run,
            steps: [...truncatedSteps.slice(0, stepIndex), patchedStep],
          },
        ],
      };
    }),
  );
}

/**
 * Delete a chat message and invalidate dependent run steps.
 *
 * @param threadId - Thread id that owns the message.
 * @param messageId - Message id to delete.
 */
export function deleteChatMessage(threadId: string, messageId: string) {
  $chatThreads.set(
    $chatThreads.get().map((thread) => {
      if (thread.id !== threadId) return thread;

      const message = thread.messages.find((entry) => entry.id === messageId);
      if (!message) return thread;
      if (message.variant === ChatMessageVariant.Trace) {
        return {
          ...thread,
          messages: thread.messages.filter((entry) => entry.id !== messageId),
        };
      }

      if (!message.runId) {
        return {
          ...thread,
          messages: thread.messages.filter((entry) => entry.id !== messageId),
          runs: [],
        };
      }

      const runIndex = thread.runs.findIndex((run) => run.id === message.runId);
      if (runIndex === -1) {
        return {
          ...thread,
          messages: thread.messages.filter((entry) => entry.id !== messageId),
          runs: [],
        };
      }

      const run = thread.runs[runIndex];
      const runIdsToRemove = thread.runs
        .slice(runIndex + 1)
        .map((entry) => entry.id);

      if (message.role === ChatRole.User) {
        const removedRunIds = new Set([message.runId, ...runIdsToRemove]);
        return {
          ...thread,
          messages: thread.messages.filter(
            (entry) => !entry.runId || !removedRunIds.has(entry.runId),
          ),
          runs: thread.runs.slice(0, runIndex),
        };
      }

      const stepIndex = message.nodeId
        ? run.steps.findIndex(
            (step) =>
              step.nodeId === message.nodeId &&
              step.assistantMessageId === messageId,
          )
        : -1;

      if (stepIndex === -1) {
        const removedRunIds = new Set([message.runId, ...runIdsToRemove]);
        return {
          ...thread,
          messages: thread.messages.filter(
            (entry) =>
              entry.id !== messageId &&
              (!entry.runId || !removedRunIds.has(entry.runId)),
          ),
          runs: thread.runs.slice(0, runIndex),
        };
      }

      const assistantMessageIdsToRemove = run.steps
        .slice(stepIndex)
        .map((step) => step.assistantMessageId)
        .filter((id): id is string => typeof id === "string");
      const removedNodeIds = run.steps
        .slice(stepIndex)
        .map((step) => step.nodeId);

      const removedRunIds = new Set(runIdsToRemove);
      const prunedMessages = thread.messages.filter((entry) => {
        if (entry.id === messageId) return false;
        if (assistantMessageIdsToRemove.includes(entry.id)) return false;
        if (entry.runId && removedRunIds.has(entry.runId)) return false;
        if (
          entry.runId === run.id &&
          entry.variant === ChatMessageVariant.Trace &&
          entry.nodeId &&
          removedNodeIds.includes(entry.nodeId)
        ) {
          return false;
        }
        return true;
      });

      return {
        ...thread,
        messages: prunedMessages,
        runs: [
          ...thread.runs.slice(0, runIndex),
          { ...run, steps: run.steps.slice(0, stepIndex) },
        ],
      };
    }),
  );
}
