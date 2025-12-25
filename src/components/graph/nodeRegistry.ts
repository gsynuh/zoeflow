import type { NodeTypes } from "@xyflow/react";

import { StandardNode } from "@/components/graph/nodes/StandardNode";
import { listNodeDefinitions, listPaletteNodes } from "@/zoeflow/registry";
import { ZoeNodeID, type ZoeNodeCategory } from "@/zoeflow/types";

export type PaletteNode = {
  type: ZoeNodeID;
  label: string;
  description: string;
  category: ZoeNodeCategory;
};

const baseNodeTypes = Object.fromEntries(
  listNodeDefinitions().map((definition) => [definition.type, StandardNode]),
) as NodeTypes;

export const graphNodeTypes: NodeTypes = baseNodeTypes;

export const paletteNodes: PaletteNode[] = listPaletteNodes().map(
  (definition) => ({
    type: definition.type,
    label: definition.label,
    description: definition.description ?? "",
    category: definition.category,
  }),
);
