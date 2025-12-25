"use client";

import { useState, type MouseEventHandler } from "react";

import type { PaletteNode } from "@/components/graph/nodeRegistry";
import { ZoeNodeCategory } from "@/zoeflow/types";
import styles from "./NodePalette.module.scss";

type NodePaletteProps = {
  isOpen: boolean;
  onClose: () => void;
  nodes: PaletteNode[];
  onSelect: (type: PaletteNode["type"]) => void;
};

const CATEGORY_ORDER: ZoeNodeCategory[] = [
  ZoeNodeCategory.Agent,
  ZoeNodeCategory.Tool,
  ZoeNodeCategory.Function,
  ZoeNodeCategory.Control,
  ZoeNodeCategory.Constant,
  ZoeNodeCategory.Boundaries,
];

/**
 * Convert a node category enum value into a human-friendly section heading.
 *
 * @param category - Category enum value.
 */
function getCategoryHeading(category: ZoeNodeCategory): string {
  if (category === ZoeNodeCategory.Boundaries) return "Boundaries";
  if (category === ZoeNodeCategory.Control) return "Control";
  if (category === ZoeNodeCategory.Constant) return "Constant";
  if (category === ZoeNodeCategory.Function) return "Function";
  if (category === ZoeNodeCategory.Tool) return "Tools";
  return "Agent";
}

/**
 * Get a description for a node category.
 *
 * @param category - Category enum value.
 */
function getCategoryDescription(category: ZoeNodeCategory): string {
  if (category === ZoeNodeCategory.Boundaries) return "Core flow endpoints";
  if (category === ZoeNodeCategory.Control) return "Flow control and routing";
  if (category === ZoeNodeCategory.Constant)
    return "Provides values to be read by later nodes";
  if (category === ZoeNodeCategory.Function) return "Data processing";
  if (category === ZoeNodeCategory.Tool)
    return "Provides tools to Completion nodes";
  if (category === ZoeNodeCategory.Agent) return "Calls an external model/API";
  return "";
}

/**
 * Convert a node category enum into a CSS module class name.
 *
 * @param category - Category enum value.
 */
function getCategoryClassName(category: ZoeNodeCategory): string {
  if (category === ZoeNodeCategory.Agent) return styles.categoryAgent;
  if (category === ZoeNodeCategory.Tool) return styles.categoryTool;
  if (category === ZoeNodeCategory.Function) return styles.categoryFunction;
  if (category === ZoeNodeCategory.Control) return styles.categoryControl;
  if (category === ZoeNodeCategory.Constant) return styles.categoryConstant;
  return styles.categoryBasics;
}

/**
 * Render the floating node palette for adding new nodes.
 */
export function NodePalette({
  isOpen,
  onClose,
  nodes,
  onSelect,
}: NodePaletteProps) {
  const [selectedCategory, setSelectedCategory] =
    useState<ZoeNodeCategory | null>(null);

  const stopPropagation: MouseEventHandler<HTMLDivElement> = (event) => {
    event.stopPropagation();
  };

  if (!isOpen) return null;

  const nodesByCategory = nodes.reduce<Record<ZoeNodeCategory, PaletteNode[]>>(
    (acc, node) => {
      acc[node.category].push(node);
      return acc;
    },
    {
      [ZoeNodeCategory.Boundaries]: [],
      [ZoeNodeCategory.Control]: [],
      [ZoeNodeCategory.Constant]: [],
      [ZoeNodeCategory.Function]: [],
      [ZoeNodeCategory.Tool]: [],
      [ZoeNodeCategory.Agent]: [],
    },
  );

  // Reset selected category when palette closes
  const handleClose = () => {
    setSelectedCategory(null);
    onClose();
  };

  if (selectedCategory === null) {
    const categoriesWithNodes = CATEGORY_ORDER.filter(
      (category) => nodesByCategory[category].length > 0,
    );

    return (
      <div className="absolute inset-0 z-40" onMouseDown={handleClose}>
        <div
          className="absolute left-1/2 top-24 z-50 w-[280px] -translate-x-1/2 rounded-xl border bg-background p-2 shadow-lg"
          onMouseDown={stopPropagation}
        >
          <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">
            Node palette
          </div>
          {categoriesWithNodes.map((category) => {
            const categoryNodes = nodesByCategory[category];

            return (
              <button
                key={category}
                type="button"
                className="w-full rounded-md px-2 py-2 text-left text-sm hover:bg-muted"
                onClick={() => setSelectedCategory(category)}
              >
                <div className="flex items-center justify-between">
                  <div className="font-medium">
                    {getCategoryHeading(category)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {categoryNodes.length}
                  </div>
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {getCategoryDescription(category)}
                </div>
              </button>
            );
          })}
          <button
            type="button"
            className="mt-1 w-full rounded-md px-2 py-2 text-left text-sm text-muted-foreground hover:bg-muted"
            onClick={handleClose}
          >
            Cancel (Esc)
          </button>
        </div>
      </div>
    );
  }

  const categoryNodes = [...nodesByCategory[selectedCategory]].sort((a, b) =>
    a.label.localeCompare(b.label),
  );
  const headerClassName = `${styles.categoryHeader} ${getCategoryClassName(selectedCategory)}`;

  return (
    <div className="absolute inset-0 z-40" onMouseDown={handleClose}>
      <div
        className="absolute left-1/2 top-24 z-50 w-[280px] -translate-x-1/2 rounded-xl border bg-background p-2 shadow-lg max-h-[70vh] overflow-y-auto"
        onMouseDown={stopPropagation}
      >
        <div className="px-2 py-1 text-xs font-semibold text-muted-foreground flex items-center justify-between">
          <span>Node palette</span>
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setSelectedCategory(null)}
          >
            ← Back
          </button>
        </div>
        <div className={headerClassName}>
          <div className={styles.categoryTitle}>
            {getCategoryHeading(selectedCategory)}
          </div>
          <div className={styles.categorySeparator} aria-hidden="true" />
        </div>
        {categoryNodes.map((node) => (
          <button
            key={node.type}
            type="button"
            className="w-full rounded-md px-2 py-2 text-left text-sm hover:bg-muted"
            onClick={() => onSelect(node.type)}
          >
            <div className="font-medium">{node.label}</div>
            <div className="text-xs text-muted-foreground">
              {node.description}
            </div>
          </button>
        ))}
        <button
          type="button"
          className="mt-1 w-full rounded-md px-2 py-2 text-left text-sm text-muted-foreground hover:bg-muted"
          onClick={handleClose}
        >
          Cancel (Esc)
        </button>
      </div>
    </div>
  );
}
