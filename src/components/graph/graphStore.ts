import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
} from "@xyflow/react";
import { atom, type WritableAtom } from "nanostores";

import { initialEdges, initialNodes } from "@/components/graph/graphDefaults";
import type { ZoeReactFlowNode } from "@/zoeflow/adapters/reactflow";
import { ZoeNodeID } from "@/zoeflow/types";

const PROTECTED_NODE_TYPES = new Set<ZoeNodeID>([ZoeNodeID.Start]);

type GraphStoreAtoms = {
  nodes: WritableAtom<ZoeReactFlowNode[]>;
  edges: WritableAtom<Edge[]>;
};

/**
 * Preserve the graph atoms across Next.js Fast Refresh so edits do not reset the canvas.
 */
function getOrCreateGraphStoreAtoms(): GraphStoreAtoms {
  const isBrowser = typeof window !== "undefined";
  const isDev = process.env.NODE_ENV !== "production";
  const canPersistAcrossHmr = isBrowser && isDev;

  if (canPersistAcrossHmr) {
    const globalScope = globalThis as typeof globalThis & {
      __zoeflowGraphStoreAtoms?: GraphStoreAtoms;
    };
    if (globalScope.__zoeflowGraphStoreAtoms)
      return globalScope.__zoeflowGraphStoreAtoms;
    const atoms: GraphStoreAtoms = {
      nodes: atom<ZoeReactFlowNode[]>(initialNodes),
      edges: atom<Edge[]>(initialEdges),
    };
    globalScope.__zoeflowGraphStoreAtoms = atoms;
    return atoms;
  }

  return {
    nodes: atom<ZoeReactFlowNode[]>(initialNodes),
    edges: atom<Edge[]>(initialEdges),
  };
}

const graphStoreAtoms = getOrCreateGraphStoreAtoms();

export const $graphNodes = graphStoreAtoms.nodes;
export const $graphEdges = graphStoreAtoms.edges;

/**
 * Apply React Flow node changes into the graph store.
 */
export function applyGraphNodesChanges(
  changes: NodeChange<ZoeReactFlowNode>[],
) {
  const filtered = filterProtectedNodeChanges(changes, $graphNodes.get());
  $graphNodes.set(applyNodeChanges(filtered, $graphNodes.get()));
}

/**
 * Apply React Flow edge changes into the graph store.
 */
export function applyGraphEdgesChanges(changes: EdgeChange[]) {
  $graphEdges.set(applyEdgeChanges(changes, $graphEdges.get()));
}

/**
 * Append a new edge to the graph store using React Flow connection data.
 */
export function addGraphEdge(connection: Connection) {
  const edges = $graphEdges.get();
  const existingIds = new Set(edges.map((edge) => edge.id).filter(Boolean));
  const id = createUniqueEdgeId(existingIds);
  $graphEdges.set(addEdge({ ...connection, id, animated: true }, edges));
}

/**
 * Add a node to the graph store.
 */
export function appendGraphNode(node: ZoeReactFlowNode) {
  $graphNodes.set([...$graphNodes.get(), node]);
}

/**
 * Update nodes in the graph store with an immutable transform.
 */
export function updateGraphNodes(
  update: (nodes: ZoeReactFlowNode[]) => ZoeReactFlowNode[],
) {
  $graphNodes.set(update($graphNodes.get()));
}

/**
 * Replace the current nodes collection.
 */
export function setGraphNodes(nodes: ZoeReactFlowNode[]) {
  $graphNodes.set(nodes);
}

/**
 * Replace the current edges collection.
 */
export function setGraphEdges(edges: Edge[]) {
  $graphEdges.set(edges);
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
 * Remove node delete changes that target protected node types.
 */
function filterProtectedNodeChanges(
  changes: NodeChange<ZoeReactFlowNode>[],
  nodes: ZoeReactFlowNode[],
) {
  if (changes.length === 0) return changes;
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const endNodeCount = nodes.filter(
    (node) => node.type === ZoeNodeID.End,
  ).length;

  return changes.filter((change) => {
    if (change.type !== "remove") return true;
    const node = nodeById.get(change.id);
    if (!node) return true;
    const nodeType = node.type as ZoeNodeID;
    if (PROTECTED_NODE_TYPES.has(nodeType)) return false;
    if (nodeType === ZoeNodeID.End) {
      return endNodeCount > 1;
    }
    return true;
  });
}
