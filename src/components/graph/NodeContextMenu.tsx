"use client";

import { useEffect, useRef, type MouseEventHandler } from "react";

import type { ZoeReactFlowNode } from "@/zoeflow/adapters/reactflow";
import { ZoeNodeID } from "@/zoeflow/types";
import styles from "./NodeContextMenu.module.scss";

type NodeContextMenuProps = {
  node: ZoeReactFlowNode;
  position: { x: number; y: number };
  onClose: () => void;
  onMute: (nodeId: string) => void;
  onDelete: (nodeId: string) => void;
  onDuplicate: (nodeId: string) => void;
};

const PROTECTED_NODE_TYPES = new Set<ZoeNodeID>([ZoeNodeID.Start]);

/**
 * Render a floating context menu for node actions.
 */
export function NodeContextMenu({
  node,
  position,
  onClose,
  onMute,
  onDelete,
  onDuplicate,
}: NodeContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const isProtected = PROTECTED_NODE_TYPES.has(node.type as ZoeNodeID);
  const isEndNode = node.type === ZoeNodeID.End;
  const isMuted = (node.data as { muted?: boolean }).muted ?? false;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  const stopPropagation: MouseEventHandler<HTMLDivElement> = (event) => {
    event.stopPropagation();
  };

  const handleMute = () => {
    onMute(node.id);
    onClose();
  };

  const handleDelete = () => {
    onDelete(node.id);
    onClose();
  };

  const handleDuplicate = () => {
    onDuplicate(node.id);
    onClose();
  };

  // Don't show menu if node is protected (no actions available)
  if (isProtected) {
    return null;
  }

  return (
    <div className={styles.overlay} onMouseDown={onClose}>
      <div
        ref={menuRef}
        className={styles.menu}
        style={{ left: position.x, top: position.y }}
        onMouseDown={stopPropagation}
      >
        {!isEndNode && (
          <button
            type="button"
            className={styles.menuItem}
            onClick={handleMute}
            aria-label={isMuted ? "Unmute node" : "Mute node"}
          >
            {isMuted ? "Unmute" : "Mute"}
          </button>
        )}
        <button
          type="button"
          className={styles.menuItem}
          onClick={handleDelete}
          aria-label="Delete node"
        >
          Delete
        </button>
        <button
          type="button"
          className={styles.menuItem}
          onClick={handleDuplicate}
          aria-label="Duplicate node"
        >
          Duplicate
        </button>
      </div>
    </div>
  );
}
