import type { Edge, Node } from "@xyflow/react";

import { getNodeDefinition } from "@/zoeflow/registry";
import {
  ZoeNodeID,
  type ZoeEdge,
  type ZoeGraph,
  type ZoeNodeData,
} from "@/zoeflow/types";

export type ZoeReactFlowNode = Node<ZoeNodeData>;
export type ZoeReactFlowEdge = Edge;

/**
 * Narrow unknown values into ZoeFlow node data.
 */
export function isZoeNodeData(value: unknown): value is ZoeNodeData {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    Object.values(ZoeNodeID).includes(
      (value as { type?: ZoeNodeID }).type as ZoeNodeID,
    )
  );
}

/**
 * Build a React Flow node from a ZoeFlow node definition.
 */
export function createReactFlowNode(options: {
  id: string;
  type: ZoeNodeID;
  position: { x: number; y: number };
  data?: Partial<ZoeNodeData>;
}): ZoeReactFlowNode {
  const definition = getNodeDefinition(options.type);
  const baseData = definition.createData();
  const data = { ...baseData, ...(options.data ?? {}) } as ZoeNodeData;
  data.type = options.type;

  return {
    id: options.id,
    type: options.type,
    position: options.position,
    data,
  };
}

/**
 * Convert React Flow nodes and edges into a ZoeFlow graph.
 */
export function toZoeGraph(
  nodes: ZoeReactFlowNode[],
  edges: ZoeReactFlowEdge[],
): ZoeGraph {
  const mappedNodes = nodes.map((node) => ({
    id: node.id,
    type: node.type as ZoeNodeID,
    data: node.data,
  }));

  const mappedEdges: ZoeEdge[] = edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourcePort: edge.sourceHandle ?? undefined,
    targetPort: edge.targetHandle ?? undefined,
  }));

  return {
    nodes: mappedNodes,
    edges: mappedEdges,
  };
}
