import { resolvePorts, validateGraph } from "@/zoeflow/engine/validation";
import { getNodeDefinition } from "@/zoeflow/registry";
import {
  ZoeNodeID,
  type ZoeEdge,
  type ZoeGraph,
  type ZoeNode,
} from "@/zoeflow/types";

export type ZoeRunStep = {
  nodeId: string;
  nodeType: ZoeNodeID;
  title: string;
  description?: string;
};

export type ZoeRunPlan = {
  steps: ZoeRunStep[];
  issues: ReturnType<typeof validateGraph>;
};

/**
 * Create a deterministic run plan by traversing from the Start node.
 */
export function createRunPlan(graph: ZoeGraph): ZoeRunPlan {
  const issues = validateGraph(graph);
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const edgesBySource = buildEdgesBySource(graph.edges);
  const startNode = graph.nodes.find((node) => node.type === ZoeNodeID.Start);

  if (!startNode) {
    return {
      steps: [],
      issues: [
        ...issues,
        {
          level: "error",
          code: "missing_start",
          message: "No Start node found to build a run plan.",
        },
      ],
    };
  }

  const steps: ZoeRunStep[] = [];
  const visited = new Set<string>();
  const stack: ZoeNode[] = [startNode];

  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || visited.has(node.id)) continue;
    visited.add(node.id);

    const definition = getNodeDefinition(node.type);
    const label = node.data.label.trim();

    steps.push({
      nodeId: node.id,
      nodeType: node.type,
      title: label || node.data.title.trim() || definition.label,
      description: definition.description,
    });

    const outgoing = edgesBySource.get(node.id) ?? [];
    const ordered = sortOutgoingEdges(outgoing, node);

    for (let index = ordered.length - 1; index >= 0; index -= 1) {
      const edge = ordered[index];
      const nextNode = nodesById.get(edge.target);
      if (nextNode && !visited.has(nextNode.id)) {
        stack.push(nextNode);
      }
    }
  }

  return {
    steps,
    issues,
  };
}

/**
 * Group edges by their source node for faster traversal.
 */
function buildEdgesBySource(edges: ZoeEdge[]) {
  const edgesBySource = new Map<string, ZoeEdge[]>();

  for (const edge of edges) {
    const next = edgesBySource.get(edge.source) ?? [];
    next.push(edge);
    edgesBySource.set(edge.source, next);
  }

  return edgesBySource;
}

/**
 * Sort outgoing edges based on output port ordering.
 */
function sortOutgoingEdges(outgoing: ZoeEdge[], node: ZoeNode) {
  const definition = getNodeDefinition(node.type);
  const outputPorts = resolvePorts(definition.outputPorts, node.data);
  const portOrder = new Map(outputPorts.map((port, index) => [port.id, index]));

  return [...outgoing].sort((a, b) => {
    const aIndex = portOrder.get(a.sourcePort ?? "") ?? Number.MAX_SAFE_INTEGER;
    const bIndex = portOrder.get(b.sourcePort ?? "") ?? Number.MAX_SAFE_INTEGER;
    if (aIndex !== bIndex) return aIndex - bIndex;
    const targetCompare = a.target.localeCompare(b.target);
    if (targetCompare !== 0) return targetCompare;
    return a.id.localeCompare(b.id);
  });
}
