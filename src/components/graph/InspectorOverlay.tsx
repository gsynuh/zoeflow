"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type RefObject,
} from "react";
import SimpleBar from "simplebar-react";

import { NodeInspector } from "@/components/graph/NodeInspector";
import type {
  ZoeNodeData,
  ZoeNodeDataPatch,
  ZoeNodeDefinitionUnion,
} from "@/zoeflow/types";
import type { Node } from "@xyflow/react";
import styles from "./InspectorOverlay.module.scss";

export type InspectorOverlayProps = {
  node: Node<ZoeNodeData> | null;
  definition: ZoeNodeDefinitionUnion | null;
  onUpdateData: (patch: ZoeNodeDataPatch) => void;
  boundsRef: RefObject<HTMLElement | null>;
  onTestRag?: () => void;
  graphVars?: Record<string, unknown>;
  onUpdateGraphVars?: (vars: Record<string, unknown>) => void;
};

const PANEL_OFFSET = 24;

type PanelPosition = { x: number; y: number };

/**
 * Render a draggable inspector overlay anchored inside the canvas.
 */
export function InspectorOverlay({
  node,
  definition,
  onUpdateData,
  boundsRef,
  onTestRag,
  graphVars = {},
  onUpdateGraphVars,
}: InspectorOverlayProps) {
  const [position, setPosition] = useState<PanelPosition | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const draggingRef = useRef(false);
  const startRef = useRef({ pointerId: 0, x: 0, y: 0, startX: 0, startY: 0 });
  const panelRef = useRef<HTMLDivElement | null>(null);

  const style = useMemo(() => {
    if (!position) return undefined;
    return {
      ["--panel-x" as never]: `${position.x}px`,
      ["--panel-y" as never]: `${position.y}px`,
    };
  }, [position]);

  useLayoutEffect(() => {
    // Initialize or update position when node changes or when there's no node
    updateClampedPosition({
      boundsRef,
      panelRef,
      position,
      setPosition,
      force: !position || position.x === PANEL_OFFSET, // Force if no position or if stuck on left
    });
  }, [boundsRef, definition, node, position]);

  useEffect(() => {
    const host = boundsRef.current;
    if (!host) return;
    let frameId = 0;

    const onResize = () => {
      if (frameId) cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(() => {
        updateClampedPosition({
          boundsRef,
          panelRef,
          position,
          setPosition,
          force: false,
        });
      });
    };

    const observer = new ResizeObserver(onResize);
    observer.observe(host);
    window.addEventListener("resize", onResize);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", onResize);
      if (frameId) cancelAnimationFrame(frameId);
    };
  }, [boundsRef, position]);

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!position) return;
      draggingRef.current = true;
      startRef.current = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        startX: position.x,
        startY: position.y,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [position],
  );

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;
      if (event.pointerId !== startRef.current.pointerId) return;

      const dx = event.clientX - startRef.current.x;
      const dy = event.clientY - startRef.current.y;
      const host = boundsRef.current;
      const panel = panelRef.current;
      if (!host || !panel) return;
      const hostRect = host.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      const maxX = Math.max(
        PANEL_OFFSET,
        hostRect.width - panelRect.width - PANEL_OFFSET,
      );
      const maxY = Math.max(
        PANEL_OFFSET,
        hostRect.height - panelRect.height - PANEL_OFFSET,
      );
      const next = clampPosition(
        { x: startRef.current.startX + dx, y: startRef.current.startY + dy },
        maxX,
        maxY,
        PANEL_OFFSET,
      );
      setPosition(next);
    },
    [boundsRef],
  );

  const onPointerUp = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerId !== startRef.current.pointerId) return;
    draggingRef.current = false;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }, []);

  return (
    <div className={styles.root} style={style} ref={panelRef}>
      <div
        className={styles.header}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {node && definition ? "Node inspector" : "Graph inspector"}
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.toggleButton}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => setIsCollapsed((current) => !current)}
            aria-label={isCollapsed ? "Expand inspector" : "Collapse inspector"}
          >
            {isCollapsed ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronUp className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
      {!isCollapsed && (
        <div className={styles.body}>
          <SimpleBar className="h-full">
            <div className="p-3 px-4">
              <NodeInspector
                node={node}
                definition={definition}
                onUpdateData={onUpdateData}
                onTestRag={onTestRag}
                graphVars={graphVars}
                onUpdateGraphVars={onUpdateGraphVars}
              />
            </div>
          </SimpleBar>
        </div>
      )}
    </div>
  );
}

/**
 * Clamp the panel position within 0..max bounds.
 */
function clampPosition(
  position: PanelPosition,
  maxX: number,
  maxY: number,
  minOffset: number,
) {
  return {
    x: Math.min(Math.max(minOffset, position.x), maxX),
    y: Math.min(Math.max(minOffset, position.y), maxY),
  };
}

type ClampOptions = {
  boundsRef: RefObject<HTMLElement | null>;
  panelRef: RefObject<HTMLDivElement | null>;
  position: PanelPosition | null;
  setPosition: (position: PanelPosition) => void;
  force: boolean;
};

/**
 * Clamp the panel inside the host bounds and initialize if needed.
 */
function updateClampedPosition({
  boundsRef,
  panelRef,
  position,
  setPosition,
  force,
}: ClampOptions) {
  const host = boundsRef.current;
  const panel = panelRef.current;
  if (!host || !panel) return;

  const hostRect = host.getBoundingClientRect();
  const panelRect = panel.getBoundingClientRect();
  const maxX = Math.max(
    PANEL_OFFSET,
    hostRect.width - panelRect.width - PANEL_OFFSET,
  );
  const maxY = Math.max(
    PANEL_OFFSET,
    hostRect.height - panelRect.height - PANEL_OFFSET,
  );

  // When initializing (no position), use top-right position
  if (!position) {
    const next = clampPosition(
      { x: maxX, y: PANEL_OFFSET },
      maxX,
      maxY,
      PANEL_OFFSET,
    );
    setPosition(next);
    return;
  }

  // If position is stuck on left (PANEL_OFFSET) but there's room on right, move it
  if (position.x === PANEL_OFFSET && maxX > PANEL_OFFSET) {
    const next = clampPosition(
      { x: maxX, y: position.y },
      maxX,
      maxY,
      PANEL_OFFSET,
    );
    setPosition(next);
    return;
  }

  const next = clampPosition(position, maxX, maxY, PANEL_OFFSET);
  if (force || position.x > maxX || position.y > maxY) {
    setPosition(next);
  }
}
