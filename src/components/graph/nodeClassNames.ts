import type { Node } from "@xyflow/react";

import { getNodeDefinition } from "@/zoeflow/registry";
import { ZoeNodeCategory, ZoeNodeID } from "@/zoeflow/types";

const BASE_NODE_CLASS = "zoe-node";

/**
 * Determine if an arbitrary string is a valid ZoeFlow node type.
 *
 * @param value - Candidate node type value.
 */
function isZoeNodeID(value: string): value is ZoeNodeID {
  return Object.values(ZoeNodeID).includes(value as ZoeNodeID);
}

/**
 * Map node ids and types to class names for styling.
 */
export function getNodeClassName(node: Node): string {
  const classes = [BASE_NODE_CLASS];

  if (typeof node.type === "string") {
    classes.push(`zoe-node-${node.type}`);

    if (isZoeNodeID(node.type)) {
      if (node.type === ZoeNodeID.Start) {
        classes.push("start-node");
        return classes.join(" ");
      }

      if (node.type === ZoeNodeID.End) {
        classes.push("end-node");
        return classes.join(" ");
      }

      const definition = getNodeDefinition(node.type);
      if (definition.category !== ZoeNodeCategory.Boundaries) {
        classes.push(`zoe-category-${definition.category}`);
      }
    }
  }

  return classes.join(" ");
}
