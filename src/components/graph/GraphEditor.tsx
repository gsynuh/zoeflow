"use client";

import "@xyflow/react/dist/style.css";

import { ReactFlowProvider } from "@xyflow/react";

import { GraphEditorLayout } from "./GraphEditorLayout";

/**
 * Provide React Flow context for the graph editor.
 */
export function GraphEditor() {
  return (
    <ReactFlowProvider>
      <GraphEditorLayout />
    </ReactFlowProvider>
  );
}
