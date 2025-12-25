"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Brain, Code, GitFork, Wrench } from "lucide-react";

import type { ZoeReactFlowNode } from "@/zoeflow/adapters/reactflow";
import { resolvePorts } from "@/zoeflow/engine/validation";
import { getNodeDefinition } from "@/zoeflow/registry";
import {
  ZoeNodeCategory,
  type ZoeNodeData,
  type ZoeNodeDefinitionUnion,
} from "@/zoeflow/types";
import styles from "./StandardNode.module.scss";

/**
 * Resolve the label to display for a node inside the graph canvas.
 *
 * @param definition - Node definition for the current node type.
 * @param data - Node data for the current node instance.
 */
function getCanvasLabel(definition: ZoeNodeDefinitionUnion, data: ZoeNodeData) {
  if (typeof definition.getCanvasLabel === "function") {
    return definition.getCanvasLabel(data as never);
  }
  return definition.label;
}

/**
 * Render standard nodes using their port definitions.
 */
export function StandardNode({ data }: NodeProps<ZoeReactFlowNode>) {
  const definition = getNodeDefinition(data.type);
  const inputPorts = resolvePorts(definition.inputPorts, data);
  const outputPorts = resolvePorts(definition.outputPorts, data);
  const outputCount = Math.max(1, outputPorts.length);
  const shouldShowOutputLabels = outputPorts.length > 1;
  const trimmedLabel = data.label.trim();
  const shouldShowUserLabel = definition.showUserLabelOnCanvas !== false;
  const showUserLabelAsMetadata =
    shouldShowUserLabel && trimmedLabel.length > 0;
  const displayLabel = getCanvasLabel(definition, data);

  // Determine which icon to show (custom icon takes precedence)
  const IconComponent = definition.icon
    ? definition.icon
    : definition.externalCall
      ? Brain
      : definition.category === ZoeNodeCategory.Tool
        ? Wrench
        : definition.category === ZoeNodeCategory.Function
          ? Code
          : definition.category === ZoeNodeCategory.Control
            ? GitFork
            : null;

  const iconLabel = definition.icon
    ? "Custom icon"
    : definition.externalCall
      ? "External API call"
      : definition.category === ZoeNodeCategory.Tool
        ? "Tool node"
        : definition.category === ZoeNodeCategory.Function
          ? "Function node"
          : definition.category === ZoeNodeCategory.Control
            ? "Control node"
            : null;

  return (
    <div
      className={styles.root}
      style={{ ["--zoe-output-count" as never]: outputCount }}
    >
      {IconComponent ? (
        <div
          className={styles.externalBadge}
          aria-label={iconLabel ?? undefined}
          title={iconLabel ?? undefined}
        >
          <IconComponent className="h-3.5 w-3.5" aria-hidden={true} />
        </div>
      ) : null}
      <div className={showUserLabelAsMetadata ? styles.title : styles.subtitle}>
        {displayLabel}
      </div>
      {showUserLabelAsMetadata ? (
        <div className={styles.subtitle}>{trimmedLabel}</div>
      ) : null}

      {inputPorts.map((port, index) => {
        const topPct = ((index + 1) / (inputPorts.length + 1)) * 100;
        return (
          <Handle
            key={port.id}
            id={port.id}
            type="target"
            position={Position.Left}
            className={styles.handleInput}
            style={{ ["--handle-top" as never]: `${topPct}%` }}
          />
        );
      })}
      {outputPorts.map((port, index) => {
        const topPct = ((index + 1) / (outputPorts.length + 1)) * 100;
        return (
          <div key={port.id} className={styles.port}>
            <Handle
              id={port.id}
              type="source"
              position={Position.Right}
              className={styles.handleOutput}
              style={{ ["--handle-top" as never]: `${topPct}%` }}
            />
            {shouldShowOutputLabels ? (
              <div
                className={styles.outputLabel}
                style={{ ["--handle-top" as never]: `${topPct}%` }}
              >
                {port.label}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
