"use client";

import { useStore } from "@nanostores/react";
import { useUpdateNodeInternals, type Connection } from "@xyflow/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from "react";

import { ChatPanel } from "@/components/graph/ChatPanel";
import { GraphEditorDialogs } from "@/components/graph/GraphEditorDialogs";
import { GraphToolbar } from "@/components/graph/GraphToolbar";
import { useFlowLibrary } from "@/components/graph/hooks/useFlowLibrary";
import { InspectorOverlay } from "@/components/graph/InspectorOverlay";
import { NodeContextMenu } from "@/components/graph/NodeContextMenu";
import { graphNodeTypes } from "@/components/graph/nodeRegistry";
import { classNames } from "@/lib/utils";
import {
  $activeChatThreadId,
  $chatThreads,
  addChatThread,
  appendChatMessage,
  appendChatThreadRunStep,
  ChatMessageVariant,
  ChatRole,
  clearChatThreadMessages,
  deleteChatMessage,
  editChatMessage,
  removeChatThread,
  resetChatThreads,
  setActiveChatThread,
  setChatThreadEdgeId,
  startChatThreadRun,
  updateChatMessage,
  updateChatMessageUsage,
  type ChatThread,
} from "@/stores/chat";
import { $themeMode, toggleThemeMode } from "@/stores/theme";
import {
  isZoeNodeData,
  toZoeGraph,
  type ZoeReactFlowNode,
} from "@/zoeflow/adapters/reactflow";
import { executeGraph } from "@/zoeflow/engine/execute";
import type { ZoeExecutionState } from "@/zoeflow/engine/types";
import { useOpenRouterModelsById } from "@/zoeflow/openrouter/useOpenRouterModels";
import { getNodeDefinition } from "@/zoeflow/registry";
import {
  ZoeNodeID,
  type ZoeNodeData,
  type ZoeNodeDataPatch,
} from "@/zoeflow/types";
import { GraphCanvas } from "./GraphCanvas";
import styles from "./GraphEditor.module.scss";
import {
  buildEdgesBySource,
  createExecutionCallbacks,
  ensureUniqueStartEdgeIds,
  findThreadModelId,
  getGraphNodeLabel,
  getThreadResumeStatus,
  isFinalCompletion,
  isFinalMessageProducingNode,
  ThreadResumePlan,
  toConversationEntries,
} from "./GraphEditorUtils";
import {
  $graphEdges,
  $graphNodes,
  addGraphEdge,
  applyGraphEdgesChanges,
  applyGraphNodesChanges,
  setGraphEdges,
  setGraphNodes,
  updateGraphNodes,
} from "./graphStore";

/**
 * Render the graph editor layout around the main canvas.
 */
export function GraphEditorLayout() {
  const nodes = useStore($graphNodes);
  const edges = useStore($graphEdges);
  const themeMode = useStore($themeMode);
  const chatThreads = useStore($chatThreads);
  const activeChatThreadId = useStore($activeChatThreadId);

  const [sidebarWidth, setSidebarWidth] = useState(360);
  const [runningThreads, setRunningThreads] = useState<Record<string, boolean>>(
    {},
  );
  const [typeScriptPreviewOpen, setTypeScriptPreviewOpen] = useState(false);
  const [modelsOpen, setModelsOpen] = useState(false);
  const [usageStatsOpen, setUsageStatsOpen] = useState(false);
  const [ragTestOpen, setRagTestOpen] = useState(false);
  const [vectorStoresOpen, setVectorStoresOpen] = useState(false);
  const [executingNodeCounts, setExecutingNodeCounts] = useState<
    Record<string, number>
  >({});
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    node: ZoeReactFlowNode;
    position: { x: number; y: number };
  } | null>(null);
  const openRouterModelsById = useOpenRouterModelsById();
  const resizingRef = useRef(false);
  const resizeStartRef = useRef({ pointerId: 0, startX: 0, startWidth: 360 });
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const executingNodeIdByThreadRef = useRef<Map<string, string | null>>(
    new Map(),
  );

  const updateNodeInternals = useUpdateNodeInternals();

  const previewGraph = useMemo(() => toZoeGraph(nodes, edges), [edges, nodes]);

  const {
    selectedFlowId,
    flowName,
    savedFlows,
    isDirty: isFlowDirty,
    canSave: canSaveFlow,
    setFlowName,
    createFlow,
    loadFlowById,
    saveCurrentFlow,
    renameFlow,
    deleteFlow,
    duplicateFlow,
    exportFlowById,
    exportCurrentFlow,
    importFlowFromPrompt,
    updateFlowVars,
  } = useFlowLibrary({
    nodes,
    edges,
    onBeforeSwitchFlow: resetChatThreads,
    onLoadCanvas: (canvas) => {
      setSelectedNodeId(null);
      setGraphNodes(canvas.nodes);
      setGraphEdges(canvas.edges);
    },
  });

  // Get current flow's vars
  const currentFlowVars = useMemo(() => {
    const currentFlow = savedFlows.find((f) => f.id === selectedFlowId);
    return currentFlow?.vars ?? {};
  }, [savedFlows, selectedFlowId]);

  /**
   * Increase the execution highlight count for a node.
   *
   * @param nodeId - Node id currently executing.
   */
  const incrementExecutingNode = useCallback((nodeId: string) => {
    setExecutingNodeCounts((current) => {
      const nextCount = (current[nodeId] ?? 0) + 1;
      return { ...current, [nodeId]: nextCount };
    });
  }, []);

  /**
   * Decrease the execution highlight count for a node.
   *
   * @param nodeId - Node id to unmark.
   */
  const decrementExecutingNode = useCallback((nodeId: string) => {
    setExecutingNodeCounts((current) => {
      const count = current[nodeId] ?? 0;
      if (count <= 1) {
        const next = { ...current };
        delete next[nodeId];
        return next;
      }
      return { ...current, [nodeId]: count - 1 };
    });
  }, []);

  const executingNodeIds = useMemo(
    () => Object.keys(executingNodeCounts),
    [executingNodeCounts],
  );

  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return nodes.find((n) => n.id === selectedNodeId) ?? null;
  }, [nodes, selectedNodeId]);

  const selectedData = useMemo<ZoeNodeData | null>(() => {
    if (!selectedNode) return null;
    return isZoeNodeData(selectedNode.data) ? selectedNode.data : null;
  }, [selectedNode]);

  const selectedDefinition = useMemo(() => {
    if (!selectedData) return null;
    return getNodeDefinition(selectedData.type);
  }, [selectedData]);

  const graphNodeIds = useMemo(
    () => new Set(nodes.map((node) => node.id)),
    [nodes],
  );

  const activeThread = useMemo(() => {
    return (
      chatThreads.find((thread) => thread.id === activeChatThreadId) ??
      chatThreads[0] ??
      null
    );
  }, [activeChatThreadId, chatThreads]);

  const resolvedActiveThreadId = activeThread?.id ?? chatThreads[0]?.id ?? null;
  const isActiveThreadRunning = resolvedActiveThreadId
    ? Boolean(runningThreads[resolvedActiveThreadId])
    : false;

  useEffect(() => {
    if (!activeThread && chatThreads[0]) {
      setActiveChatThread(chatThreads[0].id);
    }
  }, [activeThread, chatThreads]);

  const activeThreadModelId = useMemo(() => {
    if (!activeThread) return null;
    return findThreadModelId(activeThread.edgeId, nodes, edges);
  }, [activeThread, edges, nodes]);

  const activeThreadContextTokens = useMemo(() => {
    if (!activeThread) return 0;
    // Count ALL messages (including Trace, Internal, etc.) for context usage
    // This gives accurate context usage percentage including hidden/intermediate API calls
    return activeThread.messages.reduce((sum, message) => {
      // Use actual usage tokens (input + output) if available, otherwise fallback to tokenCount
      if (message.usage) {
        return (
          sum + message.usage.promptTokens + message.usage.completionTokens
        );
      }
      return sum + (message.tokenCount ?? 0);
    }, 0);
  }, [activeThread]);

  const activeThreadPromptTokens = useMemo(() => {
    if (!activeThread) return 0;
    // Accumulate prompt (input) tokens from all API calls
    return activeThread.messages.reduce((sum, message) => {
      if (message.usage) {
        return sum + message.usage.promptTokens;
      }
      return sum;
    }, 0);
  }, [activeThread]);

  const activeThreadCompletionTokens = useMemo(() => {
    if (!activeThread) return 0;
    // Accumulate completion (output) tokens from all API calls
    return activeThread.messages.reduce((sum, message) => {
      if (message.usage) {
        return sum + message.usage.completionTokens;
      }
      return sum;
    }, 0);
  }, [activeThread]);

  const activeThreadContextMaxTokens = useMemo(() => {
    if (!activeThreadModelId) return null;
    const model = openRouterModelsById[activeThreadModelId];
    return model?.context_length ?? null;
  }, [activeThreadModelId, openRouterModelsById]);

  const activeThreadCost = useMemo(() => {
    if (!activeThread) return 0;

    return activeThread.messages
      .filter(
        (message) =>
          message.variant !== ChatMessageVariant.Trace &&
          message.role !== ChatRole.App &&
          message.usage,
      )
      .reduce((sum, message) => {
        const cost = message.usage?.cost ?? 0;
        return sum + cost;
      }, 0);
  }, [activeThread]);

  const chatPanelThreads = useMemo(() => {
    const nodesById = new Map(nodes.map((node) => [node.id, node]));
    const edgesById = new Map(edges.map((edge) => [edge.id, edge]));
    const canDelete = chatThreads.length > 1;

    return chatThreads.map((thread, index) => {
      const edge = thread.edgeId ? edgesById.get(thread.edgeId) : null;
      const targetNode = edge ? nodesById.get(edge.target) : null;
      const label =
        edge && targetNode
          ? `Start → ${getGraphNodeLabel(targetNode)}`
          : thread.edgeId
            ? "Unlinked thread"
            : `Thread ${index + 1}`;
      const meta = edge
        ? undefined
        : thread.edgeId
          ? `Edge ${thread.edgeId} removed`
          : "No edge yet";

      return {
        id: thread.id,
        label,
        meta,
        messages: thread.messages,
        isRunning: Boolean(runningThreads[thread.id]),
        isLinked: Boolean(edge),
        canDelete,
      };
    });
  }, [chatThreads, edges, nodes, runningThreads]);

  /**
   * Update running state for a thread.
   *
   * @param threadId - Thread id to update.
   * @param running - Whether the thread is running.
   */
  const setThreadRunning = useCallback((threadId: string, running: boolean) => {
    setRunningThreads((current) => {
      if (running) {
        return { ...current, [threadId]: true };
      }
      if (!current[threadId]) return current;
      const next = { ...current };
      delete next[threadId];
      return next;
    });
  }, []);

  const onConnect = useCallback((connection: Connection) => {
    addGraphEdge(connection);
  }, []);

  const runThreadGraph = useCallback(
    async (
      thread: ChatThread,
      graph: ReturnType<typeof toZoeGraph>,
      request:
        | {
            kind: "user";
            message: string;
          }
        | {
            kind: "resume";
            plan: ThreadResumePlan;
          },
    ) => {
      if (runningThreads[thread.id]) return;

      const runId =
        request.kind === "user" ? crypto.randomUUID() : request.plan.run.id;

      const graphNodesById = new Map(
        graph.nodes.map((node) => [node.id, node]),
      );
      const edgesBySource = buildEdgesBySource(graph.edges);
      const assistantMessageIdByNodeId = new Map<string, string>();
      const nodeTypeByAssistantMessageId = new Map<string, ZoeNodeID>();
      const didEmitFinalAssistantMessage = { current: false };
      const lastCompletionTitle = { current: null as string | null };
      const lastCompletionModelId = { current: null as string | null };

      const controller = new AbortController();
      abortControllersRef.current.set(thread.id, controller);
      executingNodeIdByThreadRef.current.set(thread.id, null);
      setThreadRunning(thread.id, true);

      try {
        if (request.kind === "user") {
          if (!thread.edgeId) {
            appendChatMessage(
              thread.id,
              ChatRole.App,
              "Thread is not linked to a Start edge.",
              {
                variant: ChatMessageVariant.Trace,
              },
            );
            return;
          }
          const baseConversation = toConversationEntries(thread.messages);
          startChatThreadRun(thread.id, {
            id: runId,
            userMessage: request.message,
            baseConversation,
            startEdgeId: thread.edgeId,
          });
          appendChatMessage(thread.id, ChatRole.User, request.message, {
            runId,
          });

          await executeGraph({
            graph,
            userMessage: request.message,
            conversation: baseConversation,
            initialVars: currentFlowVars,
            startEdgeId: thread.edgeId,
            signal: controller.signal,
            callbacks: createExecutionCallbacks({
              thread,
              runId,
              userMessage: request.message,
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
              isFinalCompletionFn: isFinalCompletion,
              isFinalMessageProducingNodeFn: isFinalMessageProducingNode,
              onUpdateFlowVars: (vars) => updateFlowVars(selectedFlowId, vars),
            }),
          });
          return;
        }

        const plan = request.plan;
        const resumeUserMessage = plan.run.userMessage;
        const resumeInitialState =
          plan.startNodeId && plan.initialState
            ? ({
                ...plan.initialState,
                nodeOutputs: new Map<string, unknown>(),
              } as ZoeExecutionState)
            : undefined;
        const resumeOptions =
          plan.startNodeId && resumeInitialState
            ? {
                startNodeId: plan.startNodeId,
                initialState: resumeInitialState,
              }
            : (() => {
                if (!thread.edgeId) {
                  appendChatMessage(
                    thread.id,
                    ChatRole.App,
                    "Thread is not linked to a Start edge.",
                    {
                      variant: ChatMessageVariant.Trace,
                      runId,
                    },
                  );
                  return null;
                }
                return {
                  userMessage: resumeUserMessage,
                  conversation: plan.run.baseConversation,
                  startEdgeId: thread.edgeId,
                };
              })();

        if (!resumeOptions) return;

        await executeGraph({
          graph,
          initialVars: currentFlowVars,
          signal: controller.signal,
          callbacks: createExecutionCallbacks({
            thread,
            runId,
            userMessage: resumeUserMessage,
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
            isFinalCompletionFn: isFinalCompletion,
            isFinalMessageProducingNodeFn: isFinalMessageProducingNode,
            onUpdateFlowVars: (vars) => updateFlowVars(selectedFlowId, vars),
          }),
          ...resumeOptions,
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          appendChatMessage(thread.id, ChatRole.App, "Stopped.", {
            variant: ChatMessageVariant.Trace,
            runId,
          });
          return;
        }
        const messageText =
          error instanceof Error ? error.message : "Unknown completion error.";
        appendChatMessage(
          thread.id,
          ChatRole.App,
          `Flow failed: ${messageText}`,
          {
            variant: ChatMessageVariant.Trace,
            runId,
          },
        );
      } finally {
        const executingNodeId =
          executingNodeIdByThreadRef.current.get(thread.id) ?? null;
        executingNodeIdByThreadRef.current.delete(thread.id);
        if (executingNodeId) {
          decrementExecutingNode(executingNodeId);
        }
        abortControllersRef.current.delete(thread.id);
        setThreadRunning(thread.id, false);
      }
    },
    [
      currentFlowVars,
      decrementExecutingNode,
      incrementExecutingNode,
      selectedFlowId,
      runningThreads,
      setThreadRunning,
      updateFlowVars,
    ],
  );

  const onSendUserMessage = useCallback(
    async (message: string) => {
      if (!activeThread) return;
      if (runningThreads[activeThread.id]) return;
      if (getThreadResumeStatus(activeThread, graphNodeIds).canResume) {
        appendChatMessage(
          activeThread.id,
          ChatRole.App,
          "Thread is mid-run. Resume it before sending a new user message.",
          {
            variant: ChatMessageVariant.Trace,
          },
        );
        return;
      }

      const startNode = nodes.find((node) => node.type === ZoeNodeID.Start);
      if (!startNode) {
        appendChatMessage(
          activeThread.id,
          ChatRole.App,
          "No Start node found.",
          {
            variant: ChatMessageVariant.Trace,
          },
        );
        return;
      }

      const normalized = ensureUniqueStartEdgeIds(edges, startNode.id);
      const nextEdges = normalized.edges;
      if (normalized.changed) {
        setGraphEdges(nextEdges);
        normalized.idMap.forEach((nextId, previousId) => {
          chatThreads
            .filter((thread) => thread.edgeId === previousId)
            .forEach((thread) => setChatThreadEdgeId(thread.id, nextId));
        });
      }

      const startEdges = nextEdges.filter(
        (edge) => edge.source === startNode.id,
      );
      if (startEdges.length === 0) {
        appendChatMessage(
          activeThread.id,
          ChatRole.App,
          "Start node has no outgoing edges.",
          {
            variant: ChatMessageVariant.Trace,
          },
        );
        return;
      }

      const activeEdgeId = activeThread.edgeId ?? startEdges[0].id;
      if (!activeThread.edgeId) {
        setChatThreadEdgeId(activeThread.id, activeEdgeId);
      }

      let threadsSnapshot = $chatThreads.get();
      const threadsByEdgeId = new Map(
        threadsSnapshot
          .filter((thread) => thread.edgeId)
          .map((thread) => [thread.edgeId as string, thread]),
      );
      const missingEdges = startEdges.filter(
        (edge) => !threadsByEdgeId.has(edge.id),
      );
      const shouldBroadcast = missingEdges.length > 0;

      if (missingEdges.length > 0) {
        missingEdges.forEach((edge) => {
          addChatThread({ edgeId: edge.id });
        });
        threadsSnapshot = $chatThreads.get();
        threadsByEdgeId.clear();
        threadsSnapshot
          .filter((thread) => thread.edgeId)
          .forEach((thread) => {
            threadsByEdgeId.set(thread.edgeId as string, thread);
          });
      }

      const graph = toZoeGraph(nodes, nextEdges);
      const threadsToRun = shouldBroadcast
        ? startEdges
            .map((edge) => threadsByEdgeId.get(edge.id))
            .filter((thread): thread is (typeof threadsSnapshot)[number] =>
              Boolean(thread),
            )
        : [threadsByEdgeId.get(activeEdgeId) ?? activeThread];

      await Promise.all(
        threadsToRun.map(async (thread) => {
          await runThreadGraph(thread, graph, { kind: "user", message });
        }),
      );
    },
    [
      activeThread,
      chatThreads,
      edges,
      graphNodeIds,
      nodes,
      runThreadGraph,
      runningThreads,
    ],
  );

  const onResumeRun = useCallback(async () => {
    if (!activeThread) return;
    if (runningThreads[activeThread.id]) return;

    const { plan } = getThreadResumeStatus(activeThread, graphNodeIds);
    if (!plan) return;

    const startNode = nodes.find((node) => node.type === ZoeNodeID.Start);
    if (!startNode) {
      appendChatMessage(activeThread.id, ChatRole.App, "No Start node found.", {
        variant: ChatMessageVariant.Trace,
      });
      return;
    }

    const normalized = ensureUniqueStartEdgeIds(edges, startNode.id);
    const nextEdges = normalized.edges;
    if (normalized.changed) {
      setGraphEdges(nextEdges);
      normalized.idMap.forEach((nextId, previousId) => {
        chatThreads
          .filter((thread) => thread.edgeId === previousId)
          .forEach((thread) => setChatThreadEdgeId(thread.id, nextId));
      });
    }

    const graph = toZoeGraph(nodes, nextEdges);
    await runThreadGraph(activeThread, graph, { kind: "resume", plan });
  }, [
    activeThread,
    chatThreads,
    edges,
    graphNodeIds,
    nodes,
    runThreadGraph,
    runningThreads,
  ]);

  const onStop = useCallback(() => {
    if (!activeThread) return;
    const controller = abortControllersRef.current.get(activeThread.id);
    if (!controller) return;
    controller.abort();
  }, [activeThread]);

  const onClearChat = useCallback((threadId: string) => {
    clearChatThreadMessages(threadId);
  }, []);

  const resumeStatus = useMemo(() => {
    if (!activeThread) return { canResume: false, plan: null } as const;
    return getThreadResumeStatus(activeThread, graphNodeIds);
  }, [activeThread, graphNodeIds]);

  /**
   * Persist an end-user message edit.
   *
   * @param threadId - Thread id that owns the message.
   * @param messageId - Message id to update.
   * @param content - Updated message content.
   */
  const onEditMessage = useCallback(
    (threadId: string, messageId: string, content: string) => {
      editChatMessage(threadId, messageId, content);
    },
    [],
  );

  /**
   * Delete a message from a thread.
   *
   * @param threadId - Thread id that owns the message.
   * @param messageId - Message id to delete.
   */
  const onDeleteMessage = useCallback((threadId: string, messageId: string) => {
    deleteChatMessage(threadId, messageId);
  }, []);

  /**
   * Activate a chat thread in the panel.
   *
   * @param threadId - Thread id to activate.
   */
  const onSelectThread = useCallback((threadId: string) => {
    setActiveChatThread(threadId);
  }, []);

  /**
   * Remove a chat thread and stop any running execution.
   *
   * @param threadId - Thread id to remove.
   */
  const onRemoveThread = useCallback(
    (threadId: string) => {
      if (chatThreads.length <= 1) return;
      const controller = abortControllersRef.current.get(threadId);
      if (controller) {
        controller.abort();
        abortControllersRef.current.delete(threadId);
      }
      setThreadRunning(threadId, false);
      removeChatThread(threadId);
    },
    [chatThreads.length, setThreadRunning],
  );

  useEffect(() => {
    document.documentElement.classList.toggle("dark", themeMode === "dark");
  }, [themeMode]);

  const onToggleTheme = useCallback(() => {
    toggleThemeMode();
  }, []);

  const onResizePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      resizingRef.current = true;
      resizeStartRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startWidth: sidebarWidth,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
    },
    [sidebarWidth],
  );

  const onResizePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!resizingRef.current) return;
      if (event.pointerId !== resizeStartRef.current.pointerId) return;

      const dx = resizeStartRef.current.startX - event.clientX;
      const next = resizeStartRef.current.startWidth + dx;
      setSidebarWidth(Math.max(260, Math.min(640, next)));
    },
    [],
  );

  const onResizePointerUp = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (event.pointerId !== resizeStartRef.current.pointerId) return;
      resizingRef.current = false;
      event.currentTarget.releasePointerCapture(event.pointerId);
    },
    [],
  );

  const onNodeClick = useCallback((_: unknown, node: ZoeReactFlowNode) => {
    setSelectedNodeId(node.id);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
    setContextMenu(null);
  }, []);

  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: ZoeReactFlowNode) => {
      event.preventDefault();
      // Don't show context menu for protected nodes (e.g., Start node)
      if (node.type === ZoeNodeID.Start) return;
      setContextMenu({
        node,
        position: { x: event.clientX, y: event.clientY },
      });
    },
    [],
  );

  const handleMuteNode = useCallback(
    (nodeId: string) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;
      // Prevent muting protected nodes (e.g., Start node) and End nodes
      if (node.type === ZoeNodeID.Start || node.type === ZoeNodeID.End) return;

      updateGraphNodes((current) =>
        current.map((n) => {
          if (n.id !== nodeId) return n;
          const currentData = isZoeNodeData(n.data) ? n.data : null;
          if (!currentData) return n;
          const isMuted = currentData.muted ?? false;
          const nextData: ZoeNodeData = {
            ...currentData,
            muted: !isMuted,
          } as ZoeNodeData;
          return { ...n, data: nextData };
        }),
      );
    },
    [nodes],
  );

  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      applyGraphNodesChanges([{ type: "remove", id: nodeId }]);
      if (selectedNodeId === nodeId) {
        setSelectedNodeId(null);
      }
    },
    [selectedNodeId],
  );

  const handleDuplicateNode = useCallback(
    (nodeId: string) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;
      // Prevent duplicating protected nodes (e.g., Start node)
      if (node.type === ZoeNodeID.Start) return;

      const newId = crypto.randomUUID();
      const offset = 100;
      const duplicatedNode: ZoeReactFlowNode = {
        ...node,
        id: newId,
        position: {
          x: node.position.x + offset,
          y: node.position.y + offset,
        },
        data: {
          ...node.data,
          label: `${(node.data as { label?: string }).label ?? ""} (copy)`,
        },
      };

      updateGraphNodes((current) => [...current, duplicatedNode]);
      setSelectedNodeId(newId);
    },
    [nodes],
  );

  const updateSelectedNodeData = useCallback(
    (patch: ZoeNodeDataPatch) => {
      if (!selectedNodeId) return;
      const nodeId = selectedNodeId;
      updateGraphNodes((current) =>
        current.map((node) => {
          if (node.id !== nodeId) return node;
          const currentData = isZoeNodeData(node.data) ? node.data : null;
          if (!currentData) return node;
          const nextData: ZoeNodeData = {
            ...currentData,
            ...patch,
          } as ZoeNodeData;
          return { ...node, data: nextData };
        }),
      );

      if (typeof patch.cases === "number") {
        requestAnimationFrame(() => updateNodeInternals(nodeId));
      }
    },
    [selectedNodeId, updateNodeInternals],
  );

  return (
    <div className={styles.root}>
      <GraphEditorDialogs
        previewGraph={previewGraph}
        typeScriptPreviewOpen={typeScriptPreviewOpen}
        setTypeScriptPreviewOpen={setTypeScriptPreviewOpen}
        modelsOpen={modelsOpen}
        setModelsOpen={setModelsOpen}
        usageStatsOpen={usageStatsOpen}
        setUsageStatsOpen={setUsageStatsOpen}
        ragTestOpen={ragTestOpen}
        setRagTestOpen={setRagTestOpen}
        vectorStoreOpen={vectorStoresOpen}
        setVectorStoreOpen={setVectorStoresOpen}
        selectedData={selectedData}
      />
      <GraphToolbar
        className={styles.toolbar}
        flowName={flowName}
        isDirty={isFlowDirty}
        canSave={canSaveFlow}
        selectedFlowId={selectedFlowId}
        savedFlows={savedFlows}
        themeMode={themeMode}
        onToggleTheme={onToggleTheme}
        onFlowNameChange={setFlowName}
        onSave={saveCurrentFlow}
        onCreateFlow={createFlow}
        onLoadFlow={loadFlowById}
        onRenameFlow={renameFlow}
        onDuplicateFlow={duplicateFlow}
        onDeleteFlow={deleteFlow}
        onExportFlow={exportFlowById}
        onExportCurrentFlow={exportCurrentFlow}
        onImportFlow={importFlowFromPrompt}
        onOpenTypeScriptPreview={() => setTypeScriptPreviewOpen(true)}
        onOpenVectorStore={() => setVectorStoresOpen(true)}
        onOpenModels={() => setModelsOpen(true)}
        onOpenUsageStats={() => setUsageStatsOpen(true)}
      />

      <div className={styles.content}>
        <div className={styles.canvasHost} ref={canvasHostRef}>
          <GraphCanvas
            nodes={nodes}
            edges={edges}
            nodeTypes={graphNodeTypes}
            colorMode={themeMode}
            graphVars={currentFlowVars}
            onNodesChange={applyGraphNodesChanges}
            onEdgesChange={applyGraphEdgesChanges}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onNodeContextMenu={onNodeContextMenu}
            onPaneClick={onPaneClick}
            onNodeCreated={setSelectedNodeId}
            executingNodeIds={executingNodeIds}
            fitViewKey={selectedFlowId}
          />
          {contextMenu && (
            <NodeContextMenu
              node={contextMenu.node}
              position={contextMenu.position}
              onClose={() => setContextMenu(null)}
              onMute={handleMuteNode}
              onDelete={handleDeleteNode}
              onDuplicate={handleDuplicateNode}
            />
          )}
          <InspectorOverlay
            node={selectedNode}
            definition={selectedDefinition}
            onUpdateData={updateSelectedNodeData}
            boundsRef={canvasHostRef}
            onTestRag={
              selectedData?.type === ZoeNodeID.Rag
                ? () => setRagTestOpen(true)
                : undefined
            }
            graphVars={currentFlowVars}
            onUpdateGraphVars={useCallback(
              (vars: Record<string, unknown>) => {
                updateFlowVars(selectedFlowId, vars);
              },
              [selectedFlowId, updateFlowVars],
            )}
          />
        </div>

        <div
          className={classNames(styles.resizeHandle, "border-r")}
          onPointerDown={onResizePointerDown}
          onPointerMove={onResizePointerMove}
          onPointerUp={onResizePointerUp}
          onPointerCancel={onResizePointerUp}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize results panel"
        />

        <aside className={styles.sidebar} style={{ width: sidebarWidth }}>
          <section className={styles.panel}>
            <ChatPanel
              threads={chatPanelThreads}
              activeThreadId={resolvedActiveThreadId ?? ""}
              composerStats={{
                contextTokens: activeThreadContextTokens,
                contextMaxTokens: activeThreadContextMaxTokens,
                threadCost: activeThreadCost,
                promptTokens: activeThreadPromptTokens,
                completionTokens: activeThreadCompletionTokens,
              }}
              onSelectThread={onSelectThread}
              onRemoveThread={onRemoveThread}
              onSend={onSendUserMessage}
              onResume={onResumeRun}
              canResume={resumeStatus.canResume}
              isComposerLocked={resumeStatus.canResume}
              onEditMessage={onEditMessage}
              onDeleteMessage={onDeleteMessage}
              onClear={onClearChat}
              onStop={onStop}
              isRunning={isActiveThreadRunning}
            />
          </section>
        </aside>
      </div>
    </div>
  );
}
