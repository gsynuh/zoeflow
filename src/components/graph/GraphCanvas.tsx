"use client";

import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
  type NodeTypes,
} from "@xyflow/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import { getNodeClassName } from "@/components/graph/nodeClassNames";
import { paletteNodes } from "@/components/graph/nodeRegistry";
import {
  createReactFlowNode,
  type ZoeReactFlowNode,
} from "@/zoeflow/adapters/reactflow";
import { createEvaluationContext } from "@/zoeflow/engine/evaluator";
import { evaluateBooleanInputPort } from "@/zoeflow/engine/inputPorts";
import type { ZoeExecutionState } from "@/zoeflow/engine/types";
import { getNodeDefinition } from "@/zoeflow/registry";
import {
  ZoeNodeCategory,
  ZoeNodeID,
  type ZoeEdge,
  type ZoeNode,
} from "@/zoeflow/types";
import styles from "./GraphEditor.module.scss";
import { NodePalette } from "./NodePalette";
import { appendGraphNode } from "./graphStore";

type GraphCanvasProps = {
  nodes: ZoeReactFlowNode[];
  edges: Edge[];
  nodeTypes: NodeTypes;
  colorMode: "light" | "dark";
  graphVars?: Record<string, unknown>;
  executingNodeIds?: string[];
  fitViewKey?: string;
  onNodesChange: (changes: NodeChange<ZoeReactFlowNode>[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  onNodeClick: (event: unknown, node: ZoeReactFlowNode) => void;
  onNodeContextMenu?: (event: React.MouseEvent, node: ZoeReactFlowNode) => void;
  onPaneClick: () => void;
  onNodeCreated: (nodeId: string) => void;
};

/**
 * Render the main React Flow canvas along with overlays.
 */
export function GraphCanvas({
  nodes,
  edges,
  nodeTypes,
  colorMode,
  graphVars,
  executingNodeIds,
  fitViewKey,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onNodeClick,
  onNodeContextMenu,
  onPaneClick,
  onNodeCreated,
}: GraphCanvasProps) {
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const reactFlow = useReactFlow();
  const didFitViewRef = useRef(false);

  const executingNodeIdSet = useMemo(
    () => new Set(executingNodeIds ?? []),
    [executingNodeIds],
  );

  const evaluationContext = useMemo(() => {
    const nodesById = new Map<string, ZoeNode>();
    for (const node of nodes) {
      if (!node.type) continue;
      nodesById.set(node.id, node as ZoeNode);
    }

    const edgesByTarget = new Map<string, ZoeEdge[]>();
    for (const edge of edges) {
      const next = edgesByTarget.get(edge.target) ?? [];
      next.push({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourcePort: edge.sourceHandle ?? undefined,
        targetPort: edge.targetHandle ?? undefined,
      });
      edgesByTarget.set(edge.target, next);
    }

    const state: ZoeExecutionState = {
      payload: null,
      contextMessages: [],
      vars: { ...(graphVars ?? {}) },
      conversation: [],
      nodeOutputs: new Map<string, unknown>(),
    };

    return createEvaluationContext({
      state,
      nodesById,
      edgesByTarget,
    });
  }, [edges, graphVars, nodes]);

  useEffect(() => {
    didFitViewRef.current = false;
  }, [fitViewKey]);

  useEffect(() => {
    if (didFitViewRef.current) return;
    if (nodes.length === 0) return;
    didFitViewRef.current = true;
    reactFlow.fitView({ padding: 0.2 });
  }, [nodes.length, reactFlow]);

  const minimapStyle = useMemo(
    () => ({
      height: 120,
    }),
    [],
  );

  const nodesWithClassNames = useMemo(
    () =>
      nodes.map((node) => {
        const isMuted = (node.data as { muted?: boolean }).muted ?? false;
        const isExecuting = executingNodeIdSet.has(node.id);
        const enableInputValue = evaluateBooleanInputPort(
          node.id,
          "enable",
          evaluationContext,
          true,
        );
        const isDisabledByEnable = !enableInputValue;
        const baseStyle = isMuted
          ? { opacity: 0.4 }
          : isDisabledByEnable
            ? { opacity: 0.4 }
            : isExecuting
              ? {
                  outline:
                    "2px solid color-mix(in oklch, var(--primary) 65%, transparent)",
                  outlineOffset: "2px",
                  boxShadow:
                    "0 0 0 2px color-mix(in oklch, var(--primary) 22%, transparent), 0 10px 22px -16px color-mix(in oklch, var(--primary) 30%, transparent)",
                }
              : undefined;
        return {
          ...node,
          className: getNodeClassName(node),
          style: baseStyle,
        };
      }),
    [evaluationContext, executingNodeIdSet, nodes],
  );

  const edgesWithStyles = useMemo(() => {
    const nodeMap = new Map(nodes.map((node) => [node.id, node]));
    return edges.map((edge) => {
      const sourceNode = nodeMap.get(edge.source);
      if (!sourceNode || !sourceNode.type) return edge;

      const nodeType = sourceNode.type as ZoeNodeID;
      const definition = getNodeDefinition(nodeType);
      const isToolCategory = definition.category === ZoeNodeCategory.Tool;
      const isMessage = nodeType === ZoeNodeID.Message;
      const shouldBeSolid = isToolCategory || isMessage;

      if (shouldBeSolid) {
        // Ensure solid line by disabling animation and removing strokeDasharray
        const { style, ...rest } = edge;
        const newStyle = style
          ? { ...style, strokeDasharray: "0" }
          : { strokeDasharray: "0" };
        return { ...rest, style: newStyle, animated: false };
      }

      return edge;
    });
  }, [edges, nodes]);

  const addNodeOfType = useCallback(
    (type: ZoeNodeID) => {
      const host = canvasRef.current;
      if (!host) return;

      const rect = host.getBoundingClientRect();
      const center = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };

      const position = reactFlow.screenToFlowPosition(center);
      const id = crypto.randomUUID();

      const base = createReactFlowNode({
        id,
        type,
        position,
      });

      appendGraphNode(base);
      onNodeCreated(id);
      setIsPaletteOpen(false);
    },
    [onNodeCreated, reactFlow],
  );

  const onCanvasKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape") {
        setIsPaletteOpen(false);
        return;
      }
      if (event.key !== " ") return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || target?.isContentEditable)
        return;
      event.preventDefault();
      setIsPaletteOpen(true);
    },
    [],
  );

  return (
    <div
      className={styles.canvas}
      ref={canvasRef}
      tabIndex={0}
      onKeyDown={onCanvasKeyDown}
    >
      <ReactFlow
        colorMode={colorMode}
        className={styles.reactflow}
        nodes={nodesWithClassNames}
        edges={edgesWithStyles}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onNodeContextMenu={onNodeContextMenu}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        snapToGrid={true}
        snapGrid={[16, 16]}
        deleteKeyCode={["Backspace", "Delete"]}
        panActivationKeyCode={null}
      >
        <MiniMap style={minimapStyle} pannable zoomable />
        <Controls />
        <Background gap={24} size={1} />
      </ReactFlow>

      <NodePalette
        isOpen={isPaletteOpen}
        onClose={() => setIsPaletteOpen(false)}
        nodes={paletteNodes}
        onSelect={addNodeOfType}
      />
    </div>
  );
}
