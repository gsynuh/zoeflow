import { tryGetDeveloperToolDefinition } from "@/zoeflow/nodes/tool/developer";
import { ZoeNodeID, type ZoeNode } from "@/zoeflow/types";

/**
 * Resolve a human-friendly title for a node during execution.
 *
 * @param node - Node being executed.
 */
export function getNodeTitle(node: ZoeNode) {
  const rawLabel = (node.data as { label?: string }).label;
  const label = typeof rawLabel === "string" ? rawLabel.trim() : "";
  if (label) return label;

  if (node.type === ZoeNodeID.Tool) {
    const toolKey = (node.data as { toolKey?: unknown }).toolKey;
    const definition = tryGetDeveloperToolDefinition(toolKey);
    if (definition?.label) return definition.label;
  }

  const rawTitle = (node.data as { title?: string }).title;
  const title = typeof rawTitle === "string" ? rawTitle.trim() : "";
  return title || node.id;
}
