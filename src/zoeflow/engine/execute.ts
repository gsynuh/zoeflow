import { createEvaluationContext } from "@/zoeflow/engine/evaluator";
import type { ZoeExpressionScope } from "@/zoeflow/engine/expression";
import { evaluateBooleanInputPort } from "@/zoeflow/engine/inputPorts";
import type { ZoeExecutionState, ZoeRunOptions } from "@/zoeflow/engine/types";
import { resolvePorts, validateGraph } from "@/zoeflow/engine/validation";
import {
  collectMessageInputContributions,
  mergeContextMessages,
} from "@/zoeflow/nodes/message/context";
import { getNodeDefinition, getNodeExecutor } from "@/zoeflow/registry";
import { ZoeNodeID, type ZoeEdge, type ZoeNode } from "@/zoeflow/types";

/**
 * Create an isolated snapshot of an execution state for persistence and resume flows.
 *
 * @param state - Execution state to clone.
 */
function snapshotExecutionState(state: ZoeExecutionState): ZoeExecutionState {
  try {
    return structuredClone(state);
  } catch {
    return {
      payload: state.payload,
      contextMessages: [...state.contextMessages],
      vars: { ...state.vars },
      conversation: [...state.conversation],
      nodeOutputs: new Map(state.nodeOutputs),
    };
  }
}

/**
 * Execute a ZoeFlow graph from Start -> End, following edges and applying node semantics.
 */
export async function executeGraph(options: ZoeRunOptions): Promise<{
  output: unknown;
}> {
  const endpoint = options.endpoint ?? "/api/v1/completion";
  const issues = validateGraph(options.graph);
  if (issues.length > 0) {
    const summary = issues
      .map((issue) => `${issue.level.toUpperCase()}: ${issue.message}`)
      .join("\n");
    throw new Error(summary);
  }

  const nodesById = new Map(options.graph.nodes.map((node) => [node.id, node]));
  const edgesBySource = buildEdgesBySource(options.graph.edges);
  const edgesByTarget = buildEdgesByTarget(options.graph.edges);
  const startNode = options.graph.nodes.find(
    (node) => node.type === ZoeNodeID.Start,
  );
  if (!startNode) {
    throw new Error("No Start node found.");
  }
  const startFromNode = options.startNodeId
    ? (nodesById.get(options.startNodeId) ?? null)
    : startNode;
  if (!startFromNode) {
    throw new Error(`Start node ${options.startNodeId} not found.`);
  }
  if (startFromNode.id !== startNode.id && !options.initialState) {
    throw new Error("Execution resume requires an initialState snapshot.");
  }

  // Restore vars from initialState if resuming
  if (options.initialState && options.initialState.vars) {
    // vars are already included in snapshotExecutionState, so they're restored
  }
  if (options.startEdgeId && startFromNode.id === startNode.id) {
    const startEdge = options.graph.edges.find(
      (edge) => edge.id === options.startEdgeId,
    );
    if (!startEdge || startEdge.source !== startNode.id) {
      throw new Error(
        `Start edge ${options.startEdgeId} is not connected to the Start node.`,
      );
    }
  }

  const state: ZoeExecutionState = options.initialState
    ? snapshotExecutionState(options.initialState)
    : {
        payload:
          options.userMessage ||
          (startNode.data as { defaultUserPrompt?: string })
            .defaultUserPrompt ||
          "",
        contextMessages: [],
        vars: { ...(options.initialVars ?? {}) },
        conversation: [...(options.conversation ?? [])],
        nodeOutputs: new Map<string, unknown>(),
      };

  const evaluationContext = createEvaluationContext({
    state,
    nodesById,
    edgesByTarget,
  });

  const visited = new Set<string>();
  let current: ZoeNode | null = startFromNode;

  while (current) {
    if (visited.has(current.id)) {
      throw new Error(`Cycle detected during execution at node ${current.id}.`);
    }
    visited.add(current.id);

    const activeNodeId = current.id;
    const activeNodeType = current.type;
    // Check enable input port (if connected) or fall back to static muted attribute
    const staticMuted = (current.data as { muted?: boolean }).muted ?? false;
    const enableInputValue = evaluateBooleanInputPort(
      current.id,
      "enable",
      evaluationContext,
      true, // default enabled if not connected
    );
    const isMuted = !enableInputValue || staticMuted;

    options.callbacks.onNodeStart?.({
      nodeId: activeNodeId,
      nodeType: activeNodeType,
    });

    // If node is muted, skip execution and pass through to next node
    if (isMuted) {
      const next = getNextNode({
        node: current,
        chosenSourcePort: undefined,
        preferredEdgeId:
          current.id === startNode.id && startFromNode.id === startNode.id
            ? options.startEdgeId
            : undefined,
        nodesById,
        edgesBySource,
      });
      options.callbacks.onNodeFinish?.({
        nodeId: current.id,
        nodeType: current.type,
        nextNodeId: next?.id ?? null,
        nextPort: undefined,
        stop: false,
        state: snapshotExecutionState(state),
      });
      current = next;
      continue;
    }

    const callbacksForNode = {
      ...options.callbacks,
      onTrace: (message: string) => {
        options.callbacks.onTrace(message);
        options.callbacks.onTraceEvent?.({
          nodeId: activeNodeId,
          nodeType: activeNodeType,
          message,
        });
      },
    };

    const inputContributions = collectMessageInputContributions({
      nodeId: current.id,
      evaluationContext,
    });
    const scopedContextMessages = mergeContextMessages(
      state.contextMessages,
      inputContributions.contextMessages,
    );

    const scope: ZoeExpressionScope = {
      input: state.payload,
      messages: scopedContextMessages,
      contextMessages: scopedContextMessages,
      vars: state.vars,
    };

    const executor = getNodeExecutor(current.type);
    if (!executor) {
      throw new Error(`Missing executor for node type ${current.type}.`);
    }

    const result = await executor.execute(
      {
        node: current,
        state,
        scope,
        contextMessages: scopedContextMessages,
        nodesById,
        edgesByTarget,
        evaluationContext,
        runtime: {
          endpoint,
          signal: options.signal,
          callbacks: callbacksForNode,
        },
      },
      current.data as never,
    );

    // Store node output for input port evaluation
    state.nodeOutputs.set(current.id, state.payload);

    if (result?.stop) {
      options.callbacks.onNodeFinish?.({
        nodeId: current.id,
        nodeType: current.type,
        nextNodeId: null,
        nextPort: result.nextPort,
        stop: true,
        state: snapshotExecutionState(state),
      });
      break;
    }

    const next = getNextNode({
      node: current,
      chosenSourcePort: result?.nextPort,
      preferredEdgeId:
        current.id === startNode.id && startFromNode.id === startNode.id
          ? options.startEdgeId
          : undefined,
      nodesById,
      edgesBySource,
    });
    options.callbacks.onNodeFinish?.({
      nodeId: current.id,
      nodeType: current.type,
      nextNodeId: next?.id ?? null,
      nextPort: result?.nextPort,
      stop: false,
      state: snapshotExecutionState(state),
    });
    current = next;
  }

  return { output: state.payload };
}

/**
 * Group edges by their source node id.
 */
function buildEdgesBySource(edges: ZoeEdge[]) {
  const map = new Map<string, ZoeEdge[]>();
  for (const edge of edges) {
    const next = map.get(edge.source) ?? [];
    next.push(edge);
    map.set(edge.source, next);
  }
  return map;
}

/**
 * Group edges by their target node id.
 */
function buildEdgesByTarget(edges: ZoeEdge[]) {
  const map = new Map<string, ZoeEdge[]>();
  for (const edge of edges) {
    const next = map.get(edge.target) ?? [];
    next.push(edge);
    map.set(edge.target, next);
  }
  return map;
}

/**
 * Pick the next node by following the selected output port (when provided).
 */
function getNextNode(options: {
  node: ZoeNode;
  chosenSourcePort?: string;
  preferredEdgeId?: string;
  nodesById: Map<string, ZoeNode>;
  edgesBySource: Map<string, ZoeEdge[]>;
}) {
  const outgoing = options.edgesBySource.get(options.node.id) ?? [];
  if (outgoing.length === 0) return null;

  const definition = getNodeDefinition(options.node.type);
  const outputPorts = resolvePorts(definition.outputPorts, options.node.data);
  const portOrder = new Map(outputPorts.map((port, index) => [port.id, index]));

  const ordered = [...outgoing].sort((a, b) => {
    const aIndex = portOrder.get(a.sourcePort ?? "") ?? Number.MAX_SAFE_INTEGER;
    const bIndex = portOrder.get(b.sourcePort ?? "") ?? Number.MAX_SAFE_INTEGER;
    if (aIndex !== bIndex) return aIndex - bIndex;
    return a.id.localeCompare(b.id);
  });

  const chosen = options.preferredEdgeId
    ? (ordered.find((edge) => edge.id === options.preferredEdgeId) ?? null)
    : null;

  if (chosen) {
    return options.nodesById.get(chosen.target) ?? null;
  }

  const fallback = options.chosenSourcePort
    ? (ordered.find((edge) => edge.sourcePort === options.chosenSourcePort) ??
      null)
    : (ordered.find((edge) => !edge.sourcePort) ?? ordered[0] ?? null);

  if (!fallback) return null;
  return options.nodesById.get(fallback.target) ?? null;
}
