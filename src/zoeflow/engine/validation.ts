import { getNodeDefinition, listRequiredNodeTypes } from "@/zoeflow/registry";
import {
  ZoeNodeID,
  type ZoeGraph,
  type ZoeNodeData,
  type ZoeNodeDefinitionUnion,
  type ZoePortDefinition,
} from "@/zoeflow/types";

export type ZoeValidationIssue = {
  level: "error" | "warning";
  code: string;
  message: string;
  nodeId?: string;
  edgeId?: string;
};

/**
 * Validate a ZoeFlow graph for required nodes and wiring correctness.
 */
export function validateGraph(graph: ZoeGraph): ZoeValidationIssue[] {
  const issues: ZoeValidationIssue[] = [];
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));

  for (const requirement of listRequiredNodeTypes()) {
    const count = graph.nodes.filter(
      (node) => node.type === requirement.type,
    ).length;
    if (count < (requirement.requiredCount ?? 0)) {
      issues.push({
        level: "error",
        code: "missing_required_node",
        message: `Missing required node: ${requirement.label}.`,
      });
    }
    if (requirement.requiredCount === 1 && count > 1) {
      issues.push({
        level: "error",
        code: "too_many_required_nodes",
        message: `Too many ${requirement.label} nodes. Expected 1, found ${count}.`,
      });
    }
  }

  for (const edge of graph.edges) {
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);

    if (!source) {
      issues.push({
        level: "error",
        code: "edge_missing_source",
        message: `Edge ${edge.id} references a missing source node.`,
        edgeId: edge.id,
      });
      continue;
    }

    if (!target) {
      issues.push({
        level: "error",
        code: "edge_missing_target",
        message: `Edge ${edge.id} references a missing target node.`,
        edgeId: edge.id,
      });
      continue;
    }

    const sourceDefinition = getNodeDefinition(source.type as ZoeNodeID);
    const outputPorts = resolvePorts(sourceDefinition.outputPorts, source.data);

    if (edge.sourcePort) {
      const isValid = outputPorts.some((port) => port.id === edge.sourcePort);
      if (!isValid) {
        issues.push({
          level: "error",
          code: "edge_invalid_source_port",
          message: `Edge ${edge.id} references an invalid output port on ${source.id}.`,
          edgeId: edge.id,
          nodeId: source.id,
        });
      }
    } else if (outputPorts.length > 1) {
      issues.push({
        level: "warning",
        code: "edge_missing_source_port",
        message: `Edge ${edge.id} should target a specific output port on ${source.id}.`,
        edgeId: edge.id,
        nodeId: source.id,
      });
    }

    const targetDefinition = getNodeDefinition(target.type as ZoeNodeID);
    const inputPorts = resolvePorts(targetDefinition.inputPorts, target.data);

    if (edge.targetPort) {
      const isValid = inputPorts.some((port) => port.id === edge.targetPort);
      if (!isValid) {
        issues.push({
          level: "error",
          code: "edge_invalid_target_port",
          message: `Edge ${edge.id} references an invalid input port on ${target.id}.`,
          edgeId: edge.id,
          nodeId: target.id,
        });
      }
    } else if (
      inputPorts.length > 1 &&
      !inputPorts.some((port) => port.id === "in")
    ) {
      issues.push({
        level: "warning",
        code: "edge_missing_target_port",
        message: `Edge ${edge.id} should target a specific input port on ${target.id}.`,
        edgeId: edge.id,
        nodeId: target.id,
      });
    }
  }

  const startNode = graph.nodes.find((node) => node.type === ZoeNodeID.Start);
  if (startNode) {
    const adjacency = buildAdjacencyMap(graph.edges);
    const { reachable, cycleNodes } = walkGraphFromStart(
      startNode.id,
      adjacency,
    );
    const reachableEnds = graph.nodes.filter(
      (node) => node.type === ZoeNodeID.End && reachable.has(node.id),
    );
    if (reachableEnds.length === 0) {
      issues.push({
        level: "error",
        code: "missing_reachable_end",
        message: "No End node is reachable from the Start node.",
      });
    }

    if (cycleNodes.size > 0) {
      for (const nodeId of cycleNodes) {
        issues.push({
          level: "error",
          code: "cycle_detected",
          message:
            "Cycle detected in the graph. Resolve loops to build a deterministic run plan.",
          nodeId,
        });
      }
    }
  }

  return issues;
}

/**
 * Resolve port definitions with a function or static list.
 */
export function resolvePorts(
  ports: ZoeNodeDefinitionUnion["outputPorts"],
  data: ZoeNodeData,
) {
  if (typeof ports === "function") {
    const resolver = ports as (input: ZoeNodeData) => ZoePortDefinition[];
    return resolver(data);
  }
  return ports;
}

/**
 * Build a source-to-target adjacency map from graph edges.
 */
function buildAdjacencyMap(edges: ZoeGraph["edges"]) {
  const adjacency = new Map<string, string[]>();

  for (const edge of edges) {
    const next = adjacency.get(edge.source) ?? [];
    next.push(edge.target);
    adjacency.set(edge.source, next);
  }

  return adjacency;
}

/**
 * Walk the graph from a start node to find reachable nodes and cycles.
 */
function walkGraphFromStart(
  startNodeId: string,
  adjacency: Map<string, string[]>,
) {
  const reachable = new Set<string>();
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const cycleNodes = new Set<string>();

  const visit = (nodeId: string) => {
    if (visiting.has(nodeId)) {
      cycleNodes.add(nodeId);
      return;
    }
    if (visited.has(nodeId)) return;

    visiting.add(nodeId);
    reachable.add(nodeId);

    const outgoing = adjacency.get(nodeId) ?? [];
    for (const next of outgoing) {
      visit(next);
    }

    visiting.delete(nodeId);
    visited.add(nodeId);
  };

  visit(startNodeId);

  return {
    reachable,
    cycleNodes,
  };
}
