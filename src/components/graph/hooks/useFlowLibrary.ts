import type { Edge } from "@xyflow/react";
import { useCallback, useMemo, useState } from "react";

import { initialEdges, initialNodes } from "@/components/graph/graphDefaults";
import {
  openSystemDialog,
  openSystemPromptDialog,
  SystemDialogVariant,
} from "@/stores/systemDialog";
import type { ZoeReactFlowNode } from "@/zoeflow/adapters/reactflow";
import { getNodeDefinition } from "@/zoeflow/registry";
import {
  createSavedFlow,
  exportFlow,
  importFlow,
  loadSavedFlows,
  saveSavedFlows,
  type SavedFlow,
} from "@/zoeflow/storage/localFlows";
import { isShippedFlowId } from "@/zoeflow/storage/shippedFlows";
import { ZoeNodeID, type ZoeNodeData } from "@/zoeflow/types";

const DEFAULT_FLOW_ID = "default";
const DEFAULT_FLOW_NAME = "default";

export type UseFlowLibraryOptions = {
  nodes: ZoeReactFlowNode[];
  edges: Edge[];
  onLoadCanvas: (canvas: { nodes: ZoeReactFlowNode[]; edges: Edge[] }) => void;
  onBeforeSwitchFlow?: () => void;
};

export type UseFlowLibraryResult = {
  selectedFlowId: string;
  flowName: string;
  savedFlows: SavedFlow[];
  isDirty: boolean;
  canSave: boolean;
  setFlowName: (next: string) => void;
  createFlow: (name: string) => void;
  loadFlowById: (flowId: string) => void;
  saveCurrentFlow: () => void;
  renameFlow: (flowId: string, nextName: string) => void;
  deleteFlow: (flowId: string) => void;
  duplicateFlow: (flowId: string) => void;
  exportFlowById: (flowId: string) => void;
  exportCurrentFlow: () => void;
  importFlowFromPrompt: () => void;
  updateFlowVars: (flowId: string, vars: Record<string, unknown>) => void;
};

/**
 * Manage the local flow library (CRUD + import/export) with id-based persistence.
 */
export function useFlowLibrary(
  options: UseFlowLibraryOptions,
): UseFlowLibraryResult {
  const { nodes, edges, onBeforeSwitchFlow, onLoadCanvas } = options;

  const [selectedFlowId, setSelectedFlowId] = useState<string>(DEFAULT_FLOW_ID);
  const [flowName, setFlowName] = useState<string>(DEFAULT_FLOW_NAME);
  const [savedFlows, setSavedFlows] = useState<SavedFlow[]>(() =>
    sanitizeSavedFlows(loadSavedFlows()),
  );

  const currentFingerprint = useMemo(
    () => safeFingerprint({ nodes, edges }),
    [nodes, edges],
  );
  const [lastSavedFingerprint, setLastSavedFingerprint] = useState(
    () => currentFingerprint,
  );
  const [lastSavedName, setLastSavedName] = useState(() =>
    normalizeFlowName(flowName),
  );

  const normalizedFlowName = useMemo(
    () => normalizeFlowName(flowName),
    [flowName],
  );
  const isDirty =
    currentFingerprint !== lastSavedFingerprint ||
    normalizedFlowName !== lastSavedName;
  const canSave = isDirty || selectedFlowId === DEFAULT_FLOW_ID;

  const persistSavedFlows = useCallback((next: SavedFlow[]) => {
    const sanitized = sanitizeSavedFlows(next);
    saveSavedFlows(sanitized);
    setSavedFlows(sanitized);
    return sanitized;
  }, []);

  const updateFlowVars = useCallback(
    (flowId: string, vars: Record<string, unknown>) => {
      const entry = savedFlows.find((flow) => flow.id === flowId) ?? null;
      if (!entry) return;

      const updated: SavedFlow = {
        ...entry,
        vars,
        updatedAt: Date.now(),
      };
      const next = savedFlows.map((flow) =>
        flow.id === flowId ? updated : flow,
      );
      persistSavedFlows(next);
    },
    [persistSavedFlows, savedFlows],
  );

  const createFlow = useCallback(
    (name: string) => {
      onBeforeSwitchFlow?.();

      const trimmed = normalizeFlowName(name);
      if (isDefaultFlowName(trimmed)) {
        openSystemDialog({
          title: "Cannot create flow",
          message: "The default flow name is reserved.",
          variant: SystemDialogVariant.Error,
        });
        return;
      }

      const snapshot = createDefaultFlowSnapshot();
      const entry = createSavedFlow({
        id: crypto.randomUUID(),
        name: trimmed,
        canvas: snapshot,
      });

      const next = [entry, ...savedFlows];
      persistSavedFlows(next);

      setSelectedFlowId(entry.id);
      setFlowName(entry.name);
      onLoadCanvas(snapshot);
      setLastSavedFingerprint(safeFingerprint(snapshot));
      setLastSavedName(normalizeFlowName(entry.name));
    },
    [onBeforeSwitchFlow, onLoadCanvas, persistSavedFlows, savedFlows],
  );

  const loadFlowById = useCallback(
    (flowId: string) => {
      if (flowId !== selectedFlowId) {
        onBeforeSwitchFlow?.();
      }

      if (flowId === DEFAULT_FLOW_ID) {
        setSelectedFlowId(DEFAULT_FLOW_ID);
        setFlowName(DEFAULT_FLOW_NAME);
        const snapshot = createDefaultFlowSnapshot();
        onLoadCanvas(snapshot);
        setLastSavedFingerprint(safeFingerprint(snapshot));
        setLastSavedName(DEFAULT_FLOW_NAME);
        return;
      }

      const entry = savedFlows.find((flow) => flow.id === flowId) ?? null;
      if (!entry) return;

      setSelectedFlowId(entry.id);
      setFlowName(entry.name);
      const snapshot = {
        nodes: normalizeReactFlowNodesWithDefaults(
          entry.canvas.nodes as ZoeReactFlowNode[],
        ),
        edges: entry.canvas.edges,
      };
      onLoadCanvas(snapshot);
      setLastSavedFingerprint(safeFingerprint(snapshot));
      setLastSavedName(normalizeFlowName(entry.name));
    },
    [onBeforeSwitchFlow, onLoadCanvas, savedFlows, selectedFlowId],
  );

  const saveCurrentFlow = useCallback(() => {
    const trimmed = normalizeFlowName(flowName);
    if (isDefaultFlowName(trimmed)) {
      openSystemDialog({
        title: "Cannot save flow",
        message: "The default flow is read-only. Choose another name to save.",
        variant: SystemDialogVariant.Error,
      });
      return;
    }

    const now = Date.now();
    const existing =
      selectedFlowId === DEFAULT_FLOW_ID
        ? null
        : (savedFlows.find((flow) => flow.id === selectedFlowId) ?? null);

    const entry: SavedFlow = existing
      ? {
          ...existing,
          name: trimmed,
          canvas: { nodes, edges },
          updatedAt: now,
        }
      : createSavedFlow({
          id: crypto.randomUUID(),
          name: trimmed,
          canvas: { nodes, edges },
        });

    const next = existing
      ? savedFlows.map((flow) => (flow.id === entry.id ? entry : flow))
      : [entry, ...savedFlows];

    persistSavedFlows(next);
    setSelectedFlowId(entry.id);
    setFlowName(entry.name);
    setLastSavedFingerprint(currentFingerprint);
    setLastSavedName(entry.name);
  }, [
    currentFingerprint,
    edges,
    flowName,
    nodes,
    persistSavedFlows,
    savedFlows,
    selectedFlowId,
  ]);

  const renameFlow = useCallback(
    (flowId: string, nextName: string) => {
      const trimmed = normalizeFlowName(nextName);
      if (isDefaultFlowName(trimmed)) {
        openSystemDialog({
          title: "Cannot rename flow",
          message: "The default flow name is reserved.",
          variant: SystemDialogVariant.Error,
        });
        return;
      }

      const entry = savedFlows.find((flow) => flow.id === flowId) ?? null;
      if (!entry) return;

      const updated: SavedFlow = {
        ...entry,
        name: trimmed,
        updatedAt: Date.now(),
      };
      const next = savedFlows.map((flow) =>
        flow.id === flowId ? updated : flow,
      );
      persistSavedFlows(next);
      if (selectedFlowId === flowId) {
        setFlowName(updated.name);
        setLastSavedName(normalizeFlowName(updated.name));
      }
    },
    [persistSavedFlows, savedFlows, selectedFlowId],
  );

  const deleteFlow = useCallback(
    (flowId: string) => {
      if (isShippedFlowId(flowId)) {
        openSystemDialog({
          title: "Cannot delete flow",
          message: "This is a built-in flow and cannot be deleted.",
          variant: SystemDialogVariant.Error,
        });
        return;
      }

      const entry = savedFlows.find((flow) => flow.id === flowId) ?? null;
      if (!entry) return;

      const next = savedFlows.filter((flow) => flow.id !== flowId);
      persistSavedFlows(next);

      if (selectedFlowId === flowId) {
        setSelectedFlowId(DEFAULT_FLOW_ID);
        setFlowName(DEFAULT_FLOW_NAME);
        const snapshot = createDefaultFlowSnapshot();
        onLoadCanvas(snapshot);
        setLastSavedFingerprint(safeFingerprint(snapshot));
        setLastSavedName(DEFAULT_FLOW_NAME);
      }
    },
    [onLoadCanvas, persistSavedFlows, savedFlows, selectedFlowId],
  );

  const duplicateFlow = useCallback(
    (flowId: string) => {
      const entry = savedFlows.find((flow) => flow.id === flowId) ?? null;
      if (!entry) return;

      const now = Date.now();
      const names = new Set(savedFlows.map((flow) => flow.name));
      const nextName = makeDuplicateName(entry.name, names);

      const duplicated: SavedFlow = {
        ...entry,
        id: crypto.randomUUID(),
        name: nextName,
        createdAt: now,
        updatedAt: now,
      };

      const next = [duplicated, ...savedFlows];
      persistSavedFlows(next);
      setSelectedFlowId(duplicated.id);
      setFlowName(duplicated.name);
      const snapshot = {
        nodes: normalizeReactFlowNodesWithDefaults(
          entry.canvas.nodes as ZoeReactFlowNode[],
        ),
        edges: entry.canvas.edges,
      };
      onLoadCanvas(snapshot);
      setLastSavedFingerprint(safeFingerprint(snapshot));
      setLastSavedName(normalizeFlowName(duplicated.name));
    },
    [onLoadCanvas, persistSavedFlows, savedFlows],
  );

  const exportFlowById = useCallback(
    (flowId: string) => {
      const entry = savedFlows.find((flow) => flow.id === flowId) ?? null;
      if (!entry) return;
      const payload = exportFlow(entry);
      writeExportPayload(payload);
    },
    [savedFlows],
  );

  const exportCurrentFlow = useCallback(() => {
    const entry = createSavedFlow({
      id: crypto.randomUUID(),
      name: normalizeFlowName(flowName),
      canvas: { nodes, edges },
    });
    const payload = exportFlow(entry);
    writeExportPayload(payload);
  }, [edges, flowName, nodes]);

  const importFlowFromPrompt = useCallback(() => {
    openSystemPromptDialog({
      title: "Import flow",
      message: "Paste a flow JSON payload to import.",
      inputLabel: "Flow JSON",
      placeholder: "{ ... }",
      confirmLabel: "Import",
      multiline: true,
      onConfirm: (raw) => {
        const trimmed = raw.trim();
        if (!trimmed) return;

        const entry = importFlow(trimmed);
        if (!entry) {
          openSystemDialog({
            title: "Import failed",
            message: "Invalid flow payload.",
            variant: SystemDialogVariant.Error,
          });
          return;
        }
        if (isDefaultFlowName(entry.name)) {
          openSystemDialog({
            title: "Import failed",
            message: "The default flow name is reserved.",
            variant: SystemDialogVariant.Error,
          });
          return;
        }

        const now = Date.now();
        const imported: SavedFlow = {
          ...entry,
          id: crypto.randomUUID(),
          createdAt: now,
          updatedAt: now,
        };

        const next: SavedFlow[] = [imported, ...savedFlows];
        persistSavedFlows(next);

        setSelectedFlowId(imported.id);
        setFlowName(imported.name);
        const snapshot = {
          nodes: normalizeReactFlowNodesWithDefaults(
            imported.canvas.nodes as ZoeReactFlowNode[],
          ),
          edges: imported.canvas.edges,
        };
        onLoadCanvas(snapshot);
        setLastSavedFingerprint(safeFingerprint(snapshot));
        setLastSavedName(normalizeFlowName(imported.name));
      },
    });
  }, [onLoadCanvas, persistSavedFlows, savedFlows]);

  return {
    selectedFlowId,
    flowName,
    savedFlows,
    isDirty,
    canSave,
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
  };
}

/**
 * Normalize a flow name input into a persisted label.
 */
function normalizeFlowName(raw: string) {
  const trimmed = raw.trim();
  return trimmed || "Untitled flow";
}

/**
 * Check if a name matches the reserved default flow.
 */
function isDefaultFlowName(name: string) {
  return name.trim().toLowerCase() === DEFAULT_FLOW_NAME;
}

/**
 * Clone the default flow snapshot for safe reuse.
 */
function createDefaultFlowSnapshot(): {
  nodes: ZoeReactFlowNode[];
  edges: Edge[];
} {
  return {
    nodes: initialNodes.map((node) => ({
      ...node,
      position: { ...node.position },
      data: { ...node.data },
    })) as ZoeReactFlowNode[],
    edges: initialEdges.map((edge) => ({ ...edge })),
  };
}

/**
 * Migrate legacy Tool nodes with toolKey to specialized node types.
 * Converts Tool nodes with toolKey="coinFlip" to CoinFlip nodes,
 * and Tool nodes with toolKey="readDocument" to ReadDocument nodes.
 *
 * @param node - React Flow node to potentially migrate.
 */
function migrateToolNodeToSpecialized(
  node: ZoeReactFlowNode,
): ZoeReactFlowNode {
  if (node.type !== ZoeNodeID.Tool) return node;
  if (!node.data || typeof node.data !== "object") return node;

  const data = node.data as Record<string, unknown>;
  const toolKey = data.toolKey;

  // Migrate CoinFlip Tool nodes to CoinFlip nodes
  if (toolKey === ZoeNodeID.CoinFlip) {
    const definition = getNodeDefinition(ZoeNodeID.CoinFlip);
    const baseData = definition.createData();
    return {
      ...node,
      type: ZoeNodeID.CoinFlip,
      data: {
        ...baseData,
        ...node.data,
        type: ZoeNodeID.CoinFlip,
        title: data.title ?? baseData.title,
        label: data.label ?? baseData.label,
        muted: data.muted,
      } as ZoeNodeData,
    };
  }

  // Migrate ReadDocument Tool nodes to ReadDocument nodes
  if (toolKey === ZoeNodeID.ReadDocument) {
    const definition = getNodeDefinition(ZoeNodeID.ReadDocument);
    const baseData = definition.createData();
    return {
      ...node,
      type: ZoeNodeID.ReadDocument,
      data: {
        ...baseData,
        ...node.data,
        type: ZoeNodeID.ReadDocument,
        title: data.title ?? baseData.title,
        label: data.label ?? baseData.label,
        muted: data.muted,
      } as ZoeNodeData,
    };
  }

  // Keep other Tool nodes as-is
  return node;
}

/**
 * Merge node data with definition defaults so newly-added fields are present.
 * Also migrates legacy Tool nodes to specialized node types.
 *
 * @param nodes - React Flow nodes loaded from storage/import.
 */
function normalizeReactFlowNodesWithDefaults(nodes: ZoeReactFlowNode[]) {
  return nodes.map((node) => {
    // First migrate Tool nodes to specialized types if needed
    const migratedNode = migrateToolNodeToSpecialized(node);

    const definition = getNodeDefinition(migratedNode.type as ZoeNodeID);
    const baseData = definition.createData();
    return {
      ...migratedNode,
      data: {
        ...baseData,
        ...migratedNode.data,
        type: migratedNode.type,
      } as ZoeNodeData,
    };
  });
}

/**
 * Filter out reserved default flow names from persisted storage.
 */
function sanitizeSavedFlows(flows: SavedFlow[]) {
  return flows.filter((flow) => !isDefaultFlowName(flow.name));
}

/**
 * Create a user-friendly copy name while avoiding collisions.
 */
function makeDuplicateName(baseName: string, existing: Set<string>) {
  const normalized = normalizeFlowName(baseName);
  const suffix = " (copy)";
  let candidate = normalized.endsWith(suffix)
    ? normalized
    : `${normalized}${suffix}`;
  let index = 2;

  while (existing.has(candidate) || isDefaultFlowName(candidate)) {
    candidate = `${normalized}${suffix} ${index}`;
    index += 1;
  }

  return candidate;
}

/**
 * Produce a stable fingerprint string for flow snapshots.
 */
function safeFingerprint(snapshot: {
  nodes: ZoeReactFlowNode[];
  edges: Edge[];
}) {
  try {
    return JSON.stringify(snapshot);
  } catch {
    return String(Date.now());
  }
}

/**
 * Export payload via clipboard when available, otherwise show a dialog fallback.
 */
function writeExportPayload(payload: string) {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(payload);
    openSystemDialog({
      title: "Flow exported",
      message: "Exported flow to clipboard.",
    });
    return;
  }

  openSystemDialog({
    title: "Flow export",
    message: `Copy this payload:\n\n${payload}`,
  });
}
