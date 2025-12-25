import type { ZoeEvaluationContext } from "@/zoeflow/engine/evaluator";
import { evaluateBooleanInputPort } from "@/zoeflow/engine/inputPorts";
import type { ContextMessageEntry } from "@/zoeflow/openrouter/context";
import { ZoeNodeID, type ZoeMessageNodeData } from "@/zoeflow/types";

/**
 * Collect direct, node-scoped inputs wired into a node.
 *
 * @param options - Collection options.
 * @param options.nodeId - Target node id.
 * @param options.evaluationContext - Evaluation context for resolving inputs.
 */
export function collectMessageInputContributions(options: {
  nodeId: string;
  evaluationContext: ZoeEvaluationContext;
}): { contextMessages: ContextMessageEntry[] } {
  const incoming =
    options.evaluationContext.edgesByTarget.get(options.nodeId) ?? [];
  if (incoming.length === 0) return { contextMessages: [] };

  const orderedIncoming = [...incoming].sort((a, b) => {
    const sourceCompare = a.source.localeCompare(b.source);
    if (sourceCompare !== 0) return sourceCompare;
    return a.id.localeCompare(b.id);
  });

  const contextMessages: ContextMessageEntry[] = [];

  for (const edge of orderedIncoming) {
    const source = options.evaluationContext.nodesById.get(edge.source);
    if (!source || source.type !== ZoeNodeID.Message) continue;
    // Check enable input port (if connected) or fall back to static muted attribute
    const staticMuted = (source.data as { muted?: boolean }).muted ?? false;
    const enableInputValue = evaluateBooleanInputPort(
      source.id,
      "enable",
      options.evaluationContext,
      true, // default enabled if not connected
    );
    const isMuted = !enableInputValue || staticMuted;
    if (isMuted) continue;
    const data = source.data as ZoeMessageNodeData;
    const content = data.text?.trim();
    if (!content) continue;
    contextMessages.push({
      role: data.role,
      content,
      priority: data.priority,
      sourceNodeId: source.id,
    });
  }

  return { contextMessages };
}

/**
 * Merge base and node-scoped context messages without duplicating the same Message node.
 *
 * @param base - Context messages accumulated during traversal.
 * @param scoped - Context messages wired into the current node.
 */
export function mergeContextMessages(
  base: ContextMessageEntry[],
  scoped: ContextMessageEntry[],
) {
  if (scoped.length === 0) return base;

  const seenMessageNodeIds = new Set(
    base
      .map((entry) => entry.sourceNodeId)
      .filter((id): id is string => typeof id === "string"),
  );

  const merged: ContextMessageEntry[] = [...base];
  for (const entry of scoped) {
    if (entry.sourceNodeId && seenMessageNodeIds.has(entry.sourceNodeId))
      continue;
    if (entry.sourceNodeId) {
      seenMessageNodeIds.add(entry.sourceNodeId);
    }
    merged.push(entry);
  }

  return merged;
}

/**
 * Ensure message list contains the newest entry while keeping stable ordering.
 *
 * @param current - Current context messages.
 * @param entry - Message entry to append.
 */
export function appendContextMessage(
  current: ContextMessageEntry[],
  entry: ContextMessageEntry,
): ContextMessageEntry[] {
  return [...current, entry];
}

/**
 * Sort messages by priority and then by insertion order.
 *
 * @param messages - Context messages to sort.
 */
export function sortContextMessages(messages: ContextMessageEntry[]) {
  return [...messages].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return 0;
  });
}
