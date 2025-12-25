"use client";

import type { FormEvent, KeyboardEvent } from "react";
import { useCallback, useState } from "react";
import SimpleBar from "simplebar-react";

import { StreamingMarkdown } from "@/components/markdown/StreamingMarkdown";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatNumber, formatUsd } from "@/lib/format";
import { ChatMessageVariant, ChatRole, type ChatMessage } from "@/stores/chat";
import type { OpenRouterModel } from "@/zoeflow/openrouter/models";
import { estimateUsdCost } from "@/zoeflow/openrouter/pricing";
import {
  BugIcon,
  BugOffIcon,
  CheckIcon,
  CommandIcon,
  EditIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import styles from "./ChatPanel.module.scss";

export type ChatPanelProps = {
  threads: ChatPanelThread[];
  activeThreadId: string;
  modelsById?: Record<string, OpenRouterModel>;
  fallbackModelId?: string | null;
  composerStats?: {
    contextTokens: number;
    contextMaxTokens: number | null;
    threadCostUsd: number; // Cost per thread (accumulated from all API calls across all runs)
    promptTokens: number; // Accumulated input tokens across all API calls
    completionTokens: number; // Accumulated output tokens across all API calls
  };
  onSelectThread: (threadId: string) => void;
  onRemoveThread: (threadId: string) => void;
  onSend: (message: string) => void;
  onResume?: () => void;
  canResume?: boolean;
  isComposerLocked?: boolean;
  onEditMessage: (threadId: string, messageId: string, content: string) => void;
  onDeleteMessage: (threadId: string, messageId: string) => void;
  onClear: (threadId: string) => void;
  onStop?: () => void;
  isRunning?: boolean;
};

export type ChatPanelThread = {
  id: string;
  label: string;
  meta?: string;
  messages: ChatMessage[];
  isRunning: boolean;
  isLinked: boolean;
  canDelete: boolean;
};

/**
 * Render the chat panel with history and composer.
 */
export function ChatPanel({
  threads,
  activeThreadId,
  modelsById,
  fallbackModelId,
  composerStats,
  onSelectThread,
  onRemoveThread,
  onSend,
  onResume,
  canResume = false,
  isComposerLocked = false,
  onEditMessage,
  onDeleteMessage,
  onClear,
  onStop,
  isRunning = false,
}: ChatPanelProps) {
  const [draft, setDraft] = useState("");
  const [areTracesVisible, setAreTracesVisible] = useState(false);
  const [isComposerStatsHovered, setIsComposerStatsHovered] = useState(false);
  const activeThread =
    threads.find((thread) => thread.id === activeThreadId) ?? threads[0];
  const messages = activeThread?.messages ?? [];
  const visibleMessages = areTracesVisible
    ? messages
    : messages.filter(
        (message) =>
          message.variant !== ChatMessageVariant.Trace &&
          message.variant !== ChatMessageVariant.Internal,
      );
  const streamingAssistantMessageId = getStreamingAssistantMessageId(
    messages,
    isRunning,
  );

  const onSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (isRunning) return;
      const trimmed = draft.trim();
      if (isComposerLocked || !trimmed) {
        if (canResume && onResume) {
          onResume();
        }
        return;
      }
      onSend(trimmed);
      setDraft("");
    },
    [canResume, draft, isComposerLocked, isRunning, onResume, onSend],
  );

  /**
   * Submit on Cmd/Ctrl + Enter.
   */
  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (!(event.metaKey || event.ctrlKey) || event.key !== "Enter") return;
      event.preventDefault();
      if (isRunning) return;
      const trimmed = draft.trim();
      if (isComposerLocked || !trimmed) {
        if (canResume && onResume) {
          onResume();
        }
        return;
      }
      onSend(trimmed);
      setDraft("");
    },
    [canResume, draft, isComposerLocked, isRunning, onResume, onSend],
  );

  const runDisabled = isRunning || (draft.trim().length === 0 && !canResume);
  const composerDisabled = isRunning || isComposerLocked;
  const placeholder = isComposerLocked
    ? "Resume current run (edit/delete last user message if needed)"
    : "User message";

  const composerStatsDisplay = composerStats
    ? (() => {
        const maxTokens = composerStats.contextMaxTokens;
        const percentage = maxTokens
          ? Math.min(100, (composerStats.contextTokens / maxTokens) * 100)
          : null;
        const parts: string[] = [];
        if (percentage !== null) {
          parts.push(`${percentage.toFixed(1)}%`);
        }
        if (composerStats.threadCostUsd > 0) {
          parts.push(`~${formatUsd(composerStats.threadCostUsd)}`);
        }
        return parts.length > 0 ? parts.join(" · ") : null;
      })()
    : null;

  const composerStatsTooltip = composerStats
    ? (() => {
        const parts: string[] = [];
        if (composerStats.promptTokens > 0) {
          parts.push(`${formatNumber(composerStats.promptTokens)} in`);
        }
        if (composerStats.completionTokens > 0) {
          parts.push(`${formatNumber(composerStats.completionTokens)} out`);
        }
        if (composerStats.contextMaxTokens) {
          parts.push(`${formatNumber(composerStats.contextMaxTokens)} max`);
        }
        return parts.length > 0 ? parts.join(" · ") : null;
      })()
    : null;

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div className={styles.headerTitle}>Conversations</div>
        <div className={styles.headerActions}>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={() => setAreTracesVisible((previous) => !previous)}
            aria-pressed={areTracesVisible}
            aria-label={areTracesVisible ? "Hide traces" : "Show traces"}
            title={areTracesVisible ? "Hide traces" : "Show traces"}
          >
            {areTracesVisible ? (
              <BugIcon className="size-4" />
            ) : (
              <BugOffIcon className="size-4" />
            )}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => activeThread && onClear(activeThread.id)}
            disabled={!activeThread}
          >
            <EditIcon className="size-4" />
          </Button>
        </div>
      </div>

      <div className={styles.threadBar}>
        <nav
          className={styles.threadTabs}
          role="tablist"
          aria-label="Conversation threads"
        >
          {threads.map((thread) => (
            <div
              key={thread.id}
              className={[
                styles.threadTabWrap,
                thread.id === activeThread?.id
                  ? styles.threadTabWrapActive
                  : "",
              ].join(" ")}
            >
              <button
                type="button"
                role="tab"
                aria-selected={thread.id === activeThread?.id}
                className={[
                  styles.threadTab,
                  thread.id === activeThread?.id ? styles.threadTabActive : "",
                ].join(" ")}
                onClick={() => onSelectThread(thread.id)}
                title={
                  thread.meta
                    ? `${thread.label} — ${thread.meta}`
                    : thread.label
                }
              >
                <span className={styles.threadLabel}>{thread.label}</span>
                {thread.isRunning ? (
                  <span className={styles.threadPulse} aria-hidden="true" />
                ) : null}
              </button>
              <button
                type="button"
                className={styles.threadDelete}
                onClick={() => onRemoveThread(thread.id)}
                aria-label="Remove conversation"
                disabled={!thread.canDelete}
              >
                <XIcon className="size-3" />
              </button>
            </div>
          ))}
        </nav>
      </div>

      <div className={styles.messages}>
        <SimpleBar className="h-full" autoHide={false}>
          <div className={styles.messageListWrapper}>
            {visibleMessages.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                {isRunning ? (
                  <div
                    className={styles.executingRow}
                    role="status"
                    aria-live="polite"
                  >
                    Executing
                    <span className={styles.executingDots} aria-hidden="true">
                      <span className={styles.executingDot} />
                      <span className={styles.executingDot} />
                      <span className={styles.executingDot} />
                    </span>
                  </div>
                ) : messages.length === 0 ? (
                  "No messages yet."
                ) : (
                  <>
                    Traces are hidden.
                    <div>
                      <Button
                        type="button"
                        size="sm"
                        variant="link"
                        onClick={() => setAreTracesVisible(true)}
                      >
                        Show traces
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className={styles.messageList}>
                {visibleMessages.map((message) => (
                  <ChatMessageRow
                    key={message.id}
                    threadId={activeThread?.id ?? ""}
                    message={message}
                    isStreaming={message.id === streamingAssistantMessageId}
                    modelsById={modelsById}
                    fallbackModelId={fallbackModelId}
                    onEditMessage={onEditMessage}
                    onDeleteMessage={onDeleteMessage}
                  />
                ))}
                {isRunning ? (
                  <div
                    className={styles.executingRow}
                    role="status"
                    aria-live="polite"
                  >
                    Executing
                    <span className={styles.executingDots} aria-hidden="true">
                      <span className={styles.executingDot} />
                      <span className={styles.executingDot} />
                      <span className={styles.executingDot} />
                    </span>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </SimpleBar>
      </div>

      <form className={styles.composer} onSubmit={onSubmit}>
        <Textarea
          placeholder={placeholder}
          value={isComposerLocked ? "" : draft}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onKeyDown={onKeyDown}
          disabled={composerDisabled}
        />
        <div className={styles.composerRow}>
          {isRunning ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={onStop}
            >
              Stop
            </Button>
          ) : (
            <Button type="submit" size="sm" disabled={runDisabled}>
              Run
            </Button>
          )}
          <div className={styles.composerMeta}>
            {composerStatsDisplay ? (
              <div
                className={styles.composerStats}
                onMouseEnter={() => setIsComposerStatsHovered(true)}
                onMouseLeave={() => setIsComposerStatsHovered(false)}
              >
                {isComposerStatsHovered && composerStatsTooltip
                  ? composerStatsTooltip
                  : composerStatsDisplay}
              </div>
            ) : null}

            <div className={styles.composerHint}>
              Ctrl/
              <CommandIcon
                strokeWidth={1.5}
                className={styles.composerHintIcon}
              />{" "}
              + Enter
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

type ChatMessageRowProps = {
  threadId: string;
  message: ChatMessage;
  isStreaming: boolean;
  modelsById?: Record<string, OpenRouterModel>;
  fallbackModelId?: string | null;
  onEditMessage: (threadId: string, messageId: string, content: string) => void;
  onDeleteMessage: (threadId: string, messageId: string) => void;
};

/**
 * Estimate a message's USD cost based on its role, estimated token count, and model pricing.
 * Only calculates costs for assistant messages (user messages don't have costs).
 *
 * @param message - Chat message to estimate.
 * @param modelsById - OpenRouter models index.
 * @param fallbackModelId - Default model id used for prompt pricing.
 */
function estimateMessageCostUsd(
  message: ChatMessage,
  modelsById: Record<string, OpenRouterModel> | undefined,
  fallbackModelId: string | null | undefined,
) {
  if (!modelsById) return null;
  if (message.variant === ChatMessageVariant.Trace) return null;
  if (message.role === ChatRole.App) return null;
  // User messages don't have costs
  if (message.role === ChatRole.User) return null;

  const usage = message.usage;
  const modelId = message.modelId ?? fallbackModelId ?? undefined;
  if (!modelId) return null;

  const pricing = modelsById[modelId]?.pricing;
  if (usage) {
    // Calculate cost for both input (prompt) and output (completion) tokens
    const prompt = estimateUsdCost(usage.promptTokens, pricing, "prompt") ?? 0;
    const completion =
      estimateUsdCost(usage.completionTokens, pricing, "completion") ?? 0;
    return prompt + completion;
  }

  // Fallback: estimate completion cost if no usage data
  const tokenCount = message.tokenCount ?? 0;
  return estimateUsdCost(tokenCount, pricing, "completion");
}

/**
 * Render a single chat bubble.
 */
function ChatMessageRow({
  threadId,
  message,
  isStreaming,
  modelsById,
  fallbackModelId,
  onEditMessage,
  onDeleteMessage,
}: ChatMessageRowProps) {
  const isTrace = message.variant === ChatMessageVariant.Trace;
  const isInternal = message.variant === ChatMessageVariant.Internal;
  const isEditable = !isTrace && !isInternal && message.role !== ChatRole.App;
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [nextContent, setNextContent] = useState(message.content);

  const onStartEditing = useCallback(() => {
    if (!isEditable) return;
    setNextContent(message.content);
    setIsEditing(true);
  }, [isEditable, message.content]);

  /**
   * Cancel a message edit.
   */
  const onCancelEditing = useCallback(() => {
    setIsEditing(false);
    setNextContent(message.content);
  }, [message.content]);

  /**
   * Apply a message edit to the thread store.
   */
  const onSaveEditing = useCallback(() => {
    const trimmed = nextContent.trim();
    if (!trimmed) return;
    onEditMessage(threadId, message.id, trimmed);
    setIsEditing(false);
  }, [nextContent, onEditMessage, message.id, threadId]);

  /**
   * Delete the message from the thread store.
   */
  const onDelete = useCallback(() => {
    onDeleteMessage(threadId, message.id);
  }, [message.id, onDeleteMessage, threadId]);

  const traceLines = isTrace ? message.content.split("\n") : [];
  const isTraceExpandable = traceLines.length > 1;
  const tracePreview = traceLines[0] ?? "";
  const traceContent =
    isTraceExpandable && isCollapsed ? tracePreview : message.content;
  const traceAction = isTraceExpandable
    ? isCollapsed
      ? " (Show)"
      : " (Hide)"
    : "";
  /**
   * Toggle trace visibility for the message.
   */
  const onToggleTrace = useCallback(() => {
    setIsCollapsed((previous) => !previous);
  }, []);
  const roleClass = isTrace
    ? styles.messageTrace
    : isInternal
      ? styles.messageInternal
      : message.role === ChatRole.User
        ? styles.messageUser
        : styles.messageAssistant;
  const label = message.name ? message.name : message.role;

  const usageLabel =
    !isTrace &&
    message.role !== ChatRole.App &&
    message.role === ChatRole.Assistant
      ? (() => {
          const usage = message.usage;
          const cost = estimateMessageCostUsd(
            message,
            modelsById,
            fallbackModelId,
          );
          const parts: string[] = [];
          if (usage) {
            // Show input and output tokens separately
            if (usage.promptTokens > 0 || usage.completionTokens > 0) {
              const tokenParts: string[] = [];
              if (usage.promptTokens > 0) {
                tokenParts.push(`${formatNumber(usage.promptTokens)} in`);
              }
              if (usage.completionTokens > 0) {
                tokenParts.push(`${formatNumber(usage.completionTokens)} out`);
              }
              parts.push(tokenParts.join(" + "));
            }
          } else {
            // Fallback to total if no usage data
            const tokenCount = message.tokenCount ?? 0;
            if (tokenCount > 0) {
              parts.push(`${formatNumber(tokenCount)} tok`);
            }
          }
          if (cost !== null && cost > 0) {
            parts.push(`~${formatUsd(cost)}`);
          }
          return parts.length > 0 ? parts.join(" · ") : null;
        })()
      : null;

  return (
    <div className={styles.messageWrap}>
      <div className={`${styles.messageItem} ${roleClass}`}>
        {isTrace ? (
          isTraceExpandable ? (
            <button
              type="button"
              className={`${styles.messageTraceText} ${styles.traceToggle}`}
              onClick={onToggleTrace}
              aria-expanded={!isCollapsed}
            >
              {traceContent}
              {traceAction}
            </button>
          ) : (
            <div className={styles.messageTraceText}>{message.content}</div>
          )
        ) : (
          <>
            <div className={styles.messageMeta}>
              <span>{label}</span>
              {usageLabel ? (
                <span
                  className={styles.messageUsage}
                  title="Token counts include formatting overhead (role markers, message boundaries). This matches what you're billed by OpenRouter/OpenAI."
                >
                  {usageLabel}
                </span>
              ) : null}
            </div>

            {isEditing ? (
              <div className={styles.messageEditor}>
                <Textarea
                  value={nextContent}
                  onChange={(event) =>
                    setNextContent(event.currentTarget.value)
                  }
                  aria-label="Edit message content"
                />
                <div className={styles.messageEditorRow}>
                  <Button type="button" size="sm" onClick={onSaveEditing}>
                    <CheckIcon className="size-4" />
                    Save
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={onCancelEditing}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className={styles.messageBody}>
                <StreamingMarkdown
                  text={message.content}
                  isStreaming={isStreaming}
                />
              </div>
            )}
          </>
        )}
      </div>

      {isEditable && !isEditing ? (
        <div
          className={styles.messageFooterActions}
          aria-label="Message actions"
        >
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className={styles.messageFooterButton}
            onClick={onStartEditing}
            aria-label="Edit message"
          >
            <EditIcon className={styles.messageFooterIcon} />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className={styles.messageFooterButton}
            onClick={onDelete}
            aria-label="Delete message"
          >
            <Trash2Icon className={styles.messageFooterIcon} />
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Find the assistant message currently being streamed for a thread.
 *
 * Trace messages can be appended after the assistant response starts, so we use the current run id
 * (derived from the latest run-affiliated message) and pick the most recent assistant message for it.
 *
 * @param messages - Thread message list.
 * @param isThreadRunning - Whether the thread is actively executing.
 */
function getStreamingAssistantMessageId(
  messages: ChatMessage[],
  isThreadRunning: boolean,
) {
  if (!isThreadRunning) return null;

  const runId =
    [...messages].reverse().find((message) => message.runId)?.runId ?? null;
  if (!runId) return null;

  return (
    [...messages]
      .reverse()
      .find(
        (message) =>
          message.runId === runId &&
          message.role === ChatRole.Assistant &&
          message.variant !== ChatMessageVariant.Trace,
      )?.id ?? null
  );
}
