import type React from "react";

import {
  ChatMessage,
  ChatMessageVariant,
  ChatRole,
  ChatThread,
  ChatThreadRun,
  type ChatExecutionStateSnapshot,
} from "@/stores/chat";
import { ZoeReactFlowNode, toZoeGraph } from "@/zoeflow/adapters/reactflow";
import {
  ZoeAssistantVariant,
  type ZoeRunCallbacks,
} from "@/zoeflow/engine/types";
import { ConversationEntry } from "@/zoeflow/openrouter/context";
import { getNodeDefinition } from "@/zoeflow/registry";
import { ZoeLLMRole, ZoeNodeID } from "@/zoeflow/types";
import { Edge } from "@xyflow/react";

/**
 * Check if a chat message is eligible for the model conversation context.
 *
 * @param message - Chat message candidate.
 */
function isConversationChatMessage(
  message: ChatMessage,
): message is ChatMessage & { role: ChatRole.User | ChatRole.Assistant } {
  return (
    message.variant !== ChatMessageVariant.Trace &&
    message.variant !== ChatMessageVariant.Internal &&
    message.role !== ChatRole.App
  );
}

/**
 * Convert chat messages into model conversation entries.
 *
 * @param messages - Chat messages to include in the model context.
 */
function toConversationEntries(messages: ChatMessage[]): ConversationEntry[] {
  return messages.filter(isConversationChatMessage).map((message) => ({
    role:
      message.role === ChatRole.User ? ZoeLLMRole.User : ZoeLLMRole.Assistant,
    content: message.content,
  }));
}

/**
 * Extract a model id from a Zoe graph node payload when available.
 *
 * @param nodeData - Node data to inspect.
 */
function getGraphNodeModelId(nodeData: unknown): string | undefined {
  if (!nodeData || typeof nodeData !== "object") return undefined;
  const model = (nodeData as { model?: unknown }).model;
  return typeof model === "string" ? model : undefined;
}

/**
 * Normalize an execution payload into a display string for chat messages.
 *
 * @param payload - Execution payload to format.
 */
function formatChatPayload(payload: unknown) {
  if (payload === null || payload === undefined) return "";
  if (typeof payload === "string") return payload;
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return String(payload);
  }
}

/**
 * Discover the first model id reachable from a Start edge.
 *
 * @param edgeId - Start edge id associated with the thread.
 * @param nodes - Graph nodes in the editor.
 * @param edges - Graph edges in the editor.
 */
function findThreadModelId(
  edgeId: string | null,
  nodes: ZoeReactFlowNode[],
  edges: Edge[],
): string | null {
  if (!edgeId) return null;
  const edge = edges.find((candidate) => candidate.id === edgeId) ?? null;
  if (!edge) return null;

  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const edgesBySource = new Map<string, Edge[]>();
  edges.forEach((candidate) => {
    const list = edgesBySource.get(candidate.source) ?? [];
    list.push(candidate);
    edgesBySource.set(candidate.source, list);
  });

  const visited = new Set<string>();
  const queue: string[] = [edge.target];

  while (queue.length > 0) {
    const nodeId = queue.shift();
    if (!nodeId || visited.has(nodeId)) continue;
    visited.add(nodeId);

    const node = nodesById.get(nodeId);
    const modelId = node ? getGraphNodeModelId(node.data) : undefined;
    if (modelId) return modelId;

    const outgoing = edgesBySource.get(nodeId) ?? [];
    outgoing.forEach((outEdge) => queue.push(outEdge.target));
  }

  return null;
}

export type ThreadResumePlan =
  | {
      run: ChatThreadRun;
      startNodeId: string;
      initialState: ChatThreadRun["steps"][number]["state"];
    }
  | {
      run: ChatThreadRun;
      startNodeId: null;
      initialState: null;
    };

/**
 * Resolve the most recent run snapshot that can be resumed without adding a user message.
 *
 * @param runs - Run history for a thread.
 */
function getThreadResumePlan(runs: ChatThreadRun[]): ThreadResumePlan | null {
  const run = runs[runs.length - 1];
  if (!run) return null;

  const lastStep = run.steps[run.steps.length - 1] ?? null;
  if (!lastStep) {
    if (!run.userMessage.trim()) return null;
    return { run, startNodeId: null, initialState: null };
  }

  if (!lastStep.nextNodeId) return null;
  return {
    run,
    startNodeId: lastStep.nextNodeId,
    initialState: lastStep.state,
  };
}

/**
 * Check if a thread can be resumed against the current graph nodes.
 *
 * @param thread - Chat thread to evaluate.
 * @param nodeIds - Node ids present in the graph.
 */
function getThreadResumeStatus(
  thread: ChatThread,
  nodeIds: Set<string>,
): { canResume: boolean; plan: ThreadResumePlan | null } {
  const plan = getThreadResumePlan(thread.runs);
  if (!plan) return { canResume: false, plan: null };
  if (plan.startNodeId && !nodeIds.has(plan.startNodeId)) {
    return { canResume: false, plan: null };
  }
  return { canResume: true, plan };
}

/**
 * Resolve a human-friendly label for a graph node.
 *
 * @param node - Graph node to label.
 */
function getGraphNodeLabel(node: ZoeReactFlowNode | null | undefined) {
  if (!node) return "Unknown node";
  const rawLabel = (node.data as { label?: string }).label;
  const label = typeof rawLabel === "string" ? rawLabel.trim() : "";
  if (label) return label;

  const definition = getNodeDefinition(node.type as ZoeNodeID);
  return definition.label || node.id;
}

/**
 * Create a unique edge id for the current graph.
 *
 * @param existingIds - Set of ids already in use.
 */
function createUniqueEdgeId(existingIds: Set<string>) {
  let id = `edge-${crypto.randomUUID()}`;
  while (existingIds.has(id)) {
    id = `edge-${crypto.randomUUID()}`;
  }
  return id;
}

/**
 * Ensure Start node edges have unique ids, returning any updated edges.
 *
 * @param edges - Current edge list.
 * @param startNodeId - Start node id to normalize.
 */
function ensureUniqueStartEdgeIds(edges: Edge[], startNodeId: string) {
  const counts = new Map<string, number>();
  for (const edge of edges) {
    counts.set(edge.id, (counts.get(edge.id) ?? 0) + 1);
  }
  const existingIds = new Set(edges.map((edge) => edge.id).filter(Boolean));
  const idMap = new Map<string, string>();
  let changed = false;
  const normalized = edges.map((edge) => {
    if (edge.source !== startNodeId) return edge;
    const count = counts.get(edge.id) ?? 0;
    if (!edge.id || count > 1) {
      const nextId = createUniqueEdgeId(existingIds);
      existingIds.add(nextId);
      if (edge.id) {
        idMap.set(edge.id, nextId);
      }
      changed = true;
      return { ...edge, id: nextId };
    }
    return edge;
  });
  return { edges: normalized, changed, idMap };
}

/**
 * Build a map of edges grouped by source node ID.
 *
 * @param edges - Array of edges to group.
 * @returns Map of source node ID to array of edges.
 */
function buildEdgesBySource<T extends { source: string }>(
  edges: T[],
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const edge of edges) {
    const existing = map.get(edge.source) ?? [];
    existing.push(edge);
    map.set(edge.source, existing);
  }
  return map;
}

/**
 * Check if a node produces a message that should be shown in chat.
 * Message-producing nodes are: Completion nodes, or Message nodes with User/Assistant role.
 *
 * @param nodeId - The node ID to check.
 * @param graphNodesById - Map of all nodes by ID.
 * @returns True if this node produces a message for chat.
 */
function isMessageProducingNode(
  nodeId: string,
  graphNodesById: Map<string, ReturnType<typeof toZoeGraph>["nodes"][number]>,
): boolean {
  const node = graphNodesById.get(nodeId);
  if (!node) return false;

  if (node.type === ZoeNodeID.Completion) {
    return true;
  }

  if (node.type === ZoeNodeID.Message) {
    if (node.data && typeof node.data === "object") {
      const messageData = node.data as { role?: ZoeLLMRole; muted?: boolean };
      const isMuted = messageData.muted ?? false;
      const role = messageData.role;
      // Only User and Assistant messages are shown in chat (System messages are context only)
      // Explicitly check for User or Assistant role (not undefined, not System)
      if (isMuted) {
        return false;
      }
      return role === ZoeLLMRole.User || role === ZoeLLMRole.Assistant;
    }
  }

  return false;
}

/**
 * Check if a message-producing node is the final one (is the last message-producing node before End on any path).
 *
 * @param nodeId - The node ID to check.
 * @param graphNodesById - Map of all nodes by ID.
 * @param edgesBySource - Map of edges grouped by source node ID.
 * @returns True if this node is the last message-producing node before End on at least one path.
 */
function isFinalMessageProducingNode(
  nodeId: string,
  graphNodesById: Map<string, ReturnType<typeof toZoeGraph>["nodes"][number]>,
  edgesBySource: Map<string, ReturnType<typeof toZoeGraph>["edges"]>,
): boolean {
  if (!isMessageProducingNode(nodeId, graphNodesById)) {
    return false;
  }

  // Use DFS to find if there's a path to End without encountering another message-producing node
  const visited = new Set<string>();

  function hasPathToEndWithoutMessageProducingNode(
    currentNodeId: string,
  ): boolean {
    if (visited.has(currentNodeId)) {
      return false;
    }
    visited.add(currentNodeId);

    const outgoingEdges = edgesBySource.get(currentNodeId) ?? [];
    if (outgoingEdges.length === 0) {
      return false;
    }

    for (const edge of outgoingEdges) {
      const nextNode = graphNodesById.get(edge.target);
      if (!nextNode) continue;

      const isMuted =
        nextNode.data && typeof nextNode.data === "object"
          ? ((nextNode.data as { muted?: boolean }).muted ?? false)
          : false;
      if (isMuted) {
        if (hasPathToEndWithoutMessageProducingNode(nextNode.id)) {
          return true;
        }
        continue;
      }

      if (nextNode.type === ZoeNodeID.End) {
        return true;
      }

      // If we encounter another message-producing node, this path is blocked
      // Skip this path and check other paths
      if (isMessageProducingNode(nextNode.id, graphNodesById)) {
        continue;
      }

      // Continue exploring this path (no message-producing node encountered yet)
      if (hasPathToEndWithoutMessageProducingNode(nextNode.id)) {
        return true;
      }
    }

    // No path found from this node
    return false;
  }

  return hasPathToEndWithoutMessageProducingNode(nodeId);
}

/**
 * Check if a completion node is the final one (is the last completion before End on any path).
 * This is a convenience wrapper around isFinalMessageProducingNode for Completion nodes.
 *
 * @param completionNodeId - The completion node ID to check.
 * @param graphNodesById - Map of all nodes by ID.
 * @param edgesBySource - Map of edges grouped by source node ID.
 * @returns True if this completion is the last completion before End on at least one path.
 */
function isFinalCompletion(
  completionNodeId: string,
  graphNodesById: Map<string, ReturnType<typeof toZoeGraph>["nodes"][number]>,
  edgesBySource: Map<string, ReturnType<typeof toZoeGraph>["edges"]>,
): boolean {
  return isFinalMessageProducingNode(
    completionNodeId,
    graphNodesById,
    edgesBySource,
  );
}

type ExecutionCallbacksOptions = {
  thread: ChatThread;
  runId: string;
  userMessage: string;
  graphNodesById: Map<string, ReturnType<typeof toZoeGraph>["nodes"][number]>;
  edgesBySource: Map<string, ReturnType<typeof toZoeGraph>["edges"]>;
  assistantMessageIdByNodeId: Map<string, string>;
  nodeTypeByAssistantMessageId: Map<string, ZoeNodeID>;
  didEmitFinalAssistantMessage: { current: boolean };
  lastCompletionTitle: { current: string | null };
  lastCompletionModelId: { current: string | null };
  executingNodeIdByThreadRef: React.MutableRefObject<
    Map<string, string | null>
  >;
  incrementExecutingNode: (nodeId: string) => void;
  decrementExecutingNode: (nodeId: string) => void;
  appendChatMessage: typeof import("@/stores/chat").appendChatMessage;
  appendChatThreadRunStep: typeof import("@/stores/chat").appendChatThreadRunStep;
  updateChatMessage: typeof import("@/stores/chat").updateChatMessage;
  updateChatMessageUsage: typeof import("@/stores/chat").updateChatMessageUsage;
  isFinalCompletionFn: typeof isFinalCompletion;
  isFinalMessageProducingNodeFn: typeof isFinalMessageProducingNode;
  onUpdateFlowVars?: (vars: Record<string, unknown>) => void;
};

/**
 * Create execution callbacks for graph execution.
 *
 * @param options - Options for creating callbacks.
 * @returns Execution callbacks object.
 */
function createExecutionCallbacks(
  options: ExecutionCallbacksOptions,
): ZoeRunCallbacks {
  const {
    thread,
    runId,
    userMessage,
    graphNodesById,
    edgesBySource,
    assistantMessageIdByNodeId,
    nodeTypeByAssistantMessageId,
    didEmitFinalAssistantMessage,
    lastCompletionTitle,
    lastCompletionModelId,
    executingNodeIdByThreadRef,
    incrementExecutingNode,
    decrementExecutingNode,
    appendChatMessage,
    appendChatThreadRunStep,
    updateChatMessage,
    updateChatMessageUsage,
    isFinalMessageProducingNodeFn,
    onUpdateFlowVars,
  } = options;
  let lastVarsSnapshot: string | null = null;

  return {
    onTrace: () => {},
    onTraceEvent: ({ nodeId, message: trace }) => {
      appendChatMessage(thread.id, ChatRole.App, trace, {
        variant: ChatMessageVariant.Trace,
        runId,
        nodeId,
      });
    },
    onNodeStart: ({ nodeId }) => {
      executingNodeIdByThreadRef.current.set(thread.id, nodeId);
      incrementExecutingNode(nodeId);
    },
    onAssistantStart: ({ name, variant, nodeId }) => {
      // Check if we already have a messageId for this node (to avoid duplicates)
      const existingMessageId = assistantMessageIdByNodeId.get(nodeId);
      if (existingMessageId) {
        return existingMessageId;
      }

      const node = graphNodesById.get(nodeId) ?? null;
      const modelId = getGraphNodeModelId(node?.data);

      // Only create assistant message bubble for final message-producing nodes
      // For Completion nodes, check if they're the final message-producing node
      let isFinal = false;
      if (node?.type === ZoeNodeID.Completion) {
        isFinal = isFinalMessageProducingNodeFn(
          nodeId,
          graphNodesById,
          edgesBySource,
        );
      }

      // For non-final completion nodes, don't create a message at all
      if (node?.type === ZoeNodeID.Completion && !isFinal) {
        // Return a placeholder messageId that won't be displayed
        const placeholderId = `placeholder-${nodeId}`;
        assistantMessageIdByNodeId.set(nodeId, placeholderId);
        return placeholderId;
      }

      // Determine chat variant
      // Internal and Trace variants are always preserved
      // For Standard variant, only use it if the node is final
      // For Completion nodes that aren't final, we should have already returned a placeholder above
      // But as a safety check, if we somehow get here with a non-final Completion, use Trace variant
      const chatVariant =
        variant === ZoeAssistantVariant.Trace
          ? ChatMessageVariant.Trace
          : variant === ZoeAssistantVariant.Internal
            ? ChatMessageVariant.Internal
            : node?.type === ZoeNodeID.Completion && !isFinal
              ? ChatMessageVariant.Trace // Safety: non-final completion should not reach here, but use Trace if it does
              : isFinal
                ? ChatMessageVariant.Standard
                : ChatMessageVariant.Trace;
      const messageId = appendChatMessage(thread.id, ChatRole.Assistant, "", {
        name,
        nodeId,
        runId,
        modelId,
        variant: chatVariant,
      });
      // Only mark as final assistant message if it's Standard variant (final completion)
      if (chatVariant === ChatMessageVariant.Standard) {
        didEmitFinalAssistantMessage.current = true;
      }
      assistantMessageIdByNodeId.set(nodeId, messageId);
      if (node) {
        nodeTypeByAssistantMessageId.set(messageId, node.type);
      }
      return messageId;
    },
    onAssistantUpdate: (messageId, content) => {
      // Skip updates for placeholder messageIds (non-final completion nodes)
      if (messageId.startsWith("placeholder-")) {
        return;
      }
      updateChatMessage(thread.id, messageId, content);
    },
    onAssistantUsage: (messageId, usage) => {
      // Skip usage updates for placeholder messageIds (non-final completion nodes)
      if (messageId.startsWith("placeholder-")) {
        return;
      }
      updateChatMessageUsage(thread.id, messageId, usage);
    },
    onNodeFinish: ({ nodeId, nodeType, nextNodeId, nextPort, state, stop }) => {
      // Convert ZoeExecutionState to ChatExecutionStateSnapshot (exclude nodeOutputs)
      const snapshot: ChatExecutionStateSnapshot = {
        payload: state.payload,
        contextMessages: state.contextMessages,
        vars: state.vars,
        conversation: state.conversation,
      };
      appendChatThreadRunStep(thread.id, runId, {
        nodeId,
        nodeType,
        nextNodeId,
        nextPort,
        assistantMessageId: assistantMessageIdByNodeId.get(nodeId),
        state: snapshot,
      });
      if (onUpdateFlowVars) {
        let nextSnapshot: string | null = null;
        try {
          nextSnapshot = JSON.stringify(state.vars);
        } catch {
          nextSnapshot = null;
        }
        if (!nextSnapshot || nextSnapshot !== lastVarsSnapshot) {
          onUpdateFlowVars(state.vars);
          lastVarsSnapshot = nextSnapshot;
        }
      }
      executingNodeIdByThreadRef.current.set(thread.id, null);
      decrementExecutingNode(nodeId);

      if (nodeType === ZoeNodeID.Completion) {
        const node = graphNodesById.get(nodeId) ?? null;
        const isMuted =
          node?.data && typeof node.data === "object"
            ? ((node.data as { muted?: boolean }).muted ?? false)
            : false;

        if (!isMuted) {
          const labelRaw =
            node?.data && typeof node.data === "object"
              ? (node.data as { label?: unknown }).label
              : null;
          const label = typeof labelRaw === "string" ? labelRaw.trim() : "";

          lastCompletionTitle.current = label || null;
          lastCompletionModelId.current =
            getGraphNodeModelId(node?.data) ?? null;
        }
      }

      if (nodeType === ZoeNodeID.Message) {
        const node = graphNodesById.get(nodeId) ?? null;
        if (node?.data && typeof node.data === "object") {
          const messageData = node.data as {
            text?: string;
            role?: ZoeLLMRole;
            muted?: boolean;
          };
          const content = messageData.text?.trim();
          const isMuted = messageData.muted ?? false;
          if (content && !isMuted) {
            // System messages are already added to contextMessages and used by completion nodes
            // Only show User and Assistant messages in the chat panel, and only if they're final
            if (messageData.role === ZoeLLMRole.System) {
              // System messages are handled via contextMessages, don't show in chat
              return;
            }
            // Only show message if it's the final message-producing node
            const isFinal = isFinalMessageProducingNodeFn(
              nodeId,
              graphNodesById,
              edgesBySource,
            );
            if (!isFinal) {
              return;
            }
            // Map ZoeLLMRole to ChatRole for User and Assistant messages
            const role =
              messageData.role === ZoeLLMRole.Assistant
                ? ChatRole.Assistant
                : ChatRole.User;
            appendChatMessage(thread.id, role, content, {
              runId,
              nodeId,
              variant: ChatMessageVariant.Standard,
            });
          }
        }
      }

      if (
        nodeType === ZoeNodeID.End &&
        stop &&
        !didEmitFinalAssistantMessage.current
      ) {
        const content = formatChatPayload(state.payload).trim();
        if (!content) return;
        if (content === userMessage.trim()) return;
        appendChatMessage(thread.id, ChatRole.Assistant, content, {
          runId,
          nodeId,
          name: lastCompletionTitle.current ?? undefined,
          modelId: lastCompletionModelId.current ?? undefined,
        });
        didEmitFinalAssistantMessage.current = true;
      }
    },
  };
}

export {
  buildEdgesBySource,
  createExecutionCallbacks,
  createUniqueEdgeId,
  ensureUniqueStartEdgeIds,
  findThreadModelId,
  formatChatPayload,
  getGraphNodeLabel,
  getGraphNodeModelId,
  getThreadResumePlan,
  getThreadResumeStatus,
  isConversationChatMessage,
  isFinalCompletion,
  isFinalMessageProducingNode,
  toConversationEntries,
};
