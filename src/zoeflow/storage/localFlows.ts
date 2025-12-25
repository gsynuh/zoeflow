import type { Edge, Node } from "@xyflow/react";

import { shippedFlowExports } from "@/zoeflow/storage/shippedFlows";
import { ZoeNodeID, type ZoeNodeData } from "@/zoeflow/types";

const STORAGE_KEY = "zoeflow:flows";
const LEGACY_STORAGE_KEY = "zoeflow:graphs";

export type FlowCanvasSnapshot = {
  nodes: Array<Node<ZoeNodeData>>;
  edges: Edge[];
};

export type SavedFlow = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  canvas: FlowCanvasSnapshot;
  vars?: Record<string, unknown>;
};

/**
 * Load saved flows from localStorage (with one-time migration from legacy keys/shapes).
 */
export function loadSavedFlows(): SavedFlow[] {
  if (typeof window === "undefined") return [];

  let raw: string | null = null;
  let legacyRaw: string | null = null;

  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
    legacyRaw = raw ? null : window.localStorage.getItem(LEGACY_STORAGE_KEY);
  } catch {
    return [];
  }

  const payload = raw ?? legacyRaw;

  if (!payload) {
    const seeded = seedSavedFlowsFromShippedDefaults();
    if (seeded.length > 0) return seeded;
    return [];
  }

  try {
    const parsed = JSON.parse(payload) as unknown;
    if (!Array.isArray(parsed)) return [];

    let normalized = parsed
      .map((entry) => normalizeSavedFlow(entry))
      .filter((entry): entry is SavedFlow => entry !== null);

    const ensured = ensureShippedFlowsPresent(normalized);
    normalized = ensured.flows;

    if (legacyRaw) {
      saveSavedFlows(normalized);
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    } else if (ensured.changed) {
      saveSavedFlows(normalized);
    }

    return normalized;
  } catch {
    return [];
  }
}

/**
 * Persist saved flows into localStorage.
 */
export function saveSavedFlows(flows: SavedFlow[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(flows));
  } catch {
    // Ignore storage write failures (e.g. private mode / quota) and keep the session usable.
  }
}

/**
 * Save or update a flow snapshot.
 */
export function upsertSavedFlow(entry: SavedFlow): SavedFlow[] {
  const flows = loadSavedFlows();
  const index = flows.findIndex((flow) => flow.id === entry.id);

  if (index >= 0) {
    flows[index] = entry;
  } else {
    flows.unshift(entry);
  }

  saveSavedFlows(flows);
  return flows;
}

/**
 * Create a new SavedFlow entry.
 */
export function createSavedFlow(options: {
  id: string;
  name: string;
  canvas: FlowCanvasSnapshot;
  vars?: Record<string, unknown>;
}): SavedFlow {
  const now = Date.now();

  return {
    id: options.id,
    name: options.name,
    createdAt: now,
    updatedAt: now,
    canvas: options.canvas,
    vars: options.vars,
  };
}

/**
 * Export a flow entry as a JSON string.
 */
export function exportFlow(entry: SavedFlow) {
  return JSON.stringify(entry, null, 2);
}

/**
 * Import a SavedFlow entry from JSON.
 */
export function importFlow(raw: string): SavedFlow | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return normalizeSavedFlow(parsed);
  } catch {
    return null;
  }
}

/**
 * Normalize unknown input into a SavedFlow, including legacy shapes.
 *
 * @param value - Parsed JSON payload (either SavedFlow or legacy canvas-only shape).
 */
export function normalizeSavedFlow(value: unknown): SavedFlow | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id : null;
  const name = typeof record.name === "string" ? record.name : null;
  if (!id || !name) return null;

  const createdAt =
    typeof record.createdAt === "number" ? record.createdAt : Date.now();
  const updatedAt =
    typeof record.updatedAt === "number" ? record.updatedAt : createdAt;

  const canvas = normalizeCanvasSnapshot(record.canvas ?? record);
  if (!canvas) return null;

  const vars =
    typeof record.vars === "object" &&
    record.vars !== null &&
    !Array.isArray(record.vars)
      ? (record.vars as Record<string, unknown>)
      : undefined;

  return {
    id,
    name,
    createdAt,
    updatedAt,
    canvas: migrateToolNodesToSpecialized(migrateStartNodeDefaults(canvas)),
    vars,
  };
}

/**
 * Seed localStorage with shipped flow exports when no saved flows exist yet.
 */
function seedSavedFlowsFromShippedDefaults(): SavedFlow[] {
  const normalized = shippedFlowExports
    .map((entry) => normalizeSavedFlow(entry))
    .filter((entry): entry is SavedFlow => entry !== null);

  if (normalized.length === 0) return [];
  saveSavedFlows(normalized);
  return normalized;
}

/**
 * Merge shipped flows into the persisted flows list (adding any missing shipped ids).
 *
 * @param flows - Current saved flows loaded from storage.
 */
function ensureShippedFlowsPresent(flows: SavedFlow[]) {
  const shipped = shippedFlowExports
    .map((entry) => normalizeSavedFlow(entry))
    .filter((entry): entry is SavedFlow => entry !== null);

  if (shipped.length === 0) return { flows, changed: false };

  const existingIds = new Set(flows.map((flow) => flow.id));
  const missing = shipped.filter((entry) => !existingIds.has(entry.id));
  if (missing.length === 0) return { flows, changed: false };

  return { flows: [...missing, ...flows], changed: true };
}

/**
 * Normalize unknown input into a FlowCanvasSnapshot.
 */
function normalizeCanvasSnapshot(value: unknown): FlowCanvasSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const nodes = Array.isArray(record.nodes)
    ? (record.nodes as Array<Node<ZoeNodeData>>)
    : null;
  const edges = Array.isArray(record.edges) ? (record.edges as Edge[]) : null;
  if (!nodes || !edges) return null;
  return { nodes, edges };
}

/**
 * Migrate legacy Start node fields onto the new data shape.
 */
function migrateStartNodeDefaults(
  canvas: FlowCanvasSnapshot,
): FlowCanvasSnapshot {
  const nodes = canvas.nodes.map((node) => {
    if (node?.type !== "start") return node;
    if (!node.data || typeof node.data !== "object") return node;

    const data = node.data as Record<string, unknown>;
    if (typeof data.defaultUserPrompt === "string") return node;
    if (typeof data.userPrompt !== "string") return node;

    const nextData = { ...data, defaultUserPrompt: data.userPrompt };
    delete (nextData as Record<string, unknown>).userPrompt;

    return {
      ...node,
      data: nextData as ZoeNodeData,
    };
  });

  return {
    nodes,
    edges: canvas.edges,
  };
}

/**
 * Migrate legacy Tool nodes with toolKey to specialized node types.
 * Converts Tool nodes with toolKey="coinFlip" to CoinFlip nodes,
 * and Tool nodes with toolKey="readDocument" to ReadDocument nodes.
 */
function migrateToolNodesToSpecialized(
  canvas: FlowCanvasSnapshot,
): FlowCanvasSnapshot {
  const nodes = canvas.nodes.map((node) => {
    if (node?.type !== ZoeNodeID.Tool) return node;
    if (!node.data || typeof node.data !== "object") return node;

    const data = node.data as Record<string, unknown>;
    const toolKey = data.toolKey;

    // Migrate CoinFlip Tool nodes to CoinFlip nodes
    if (toolKey === ZoeNodeID.CoinFlip) {
      return {
        ...node,
        type: ZoeNodeID.CoinFlip,
        data: {
          type: ZoeNodeID.CoinFlip,
          title: data.title ?? "Coin Flip",
          label: data.label ?? "",
          muted: data.muted,
        } as ZoeNodeData,
      };
    }

    // Migrate ReadDocument Tool nodes to ReadDocument nodes
    if (toolKey === ZoeNodeID.ReadDocument) {
      return {
        ...node,
        type: ZoeNodeID.ReadDocument,
        data: {
          type: ZoeNodeID.ReadDocument,
          title: data.title ?? "Read Document",
          label: data.label ?? "",
          muted: data.muted,
        } as ZoeNodeData,
      };
    }

    // Keep other Tool nodes as-is (they might be using other toolKeys or be abstract)
    return node;
  });

  return {
    nodes,
    edges: canvas.edges,
  };
}
