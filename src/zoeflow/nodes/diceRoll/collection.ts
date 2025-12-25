import type { ZoeEvaluationContext } from "@/zoeflow/engine/evaluator";
import { evaluateBooleanInputPort } from "@/zoeflow/engine/inputPorts";
import { getDeveloperToolDefinition } from "@/zoeflow/nodes/tool/developer";
import type { OpenRouterTool } from "@/zoeflow/openrouter/types";
import { ZoeNodeID, type ZoeDiceRollNodeData } from "@/zoeflow/types";

export type DiceRollInputContribution = {
  nodeId: string;
  data: ZoeDiceRollNodeData;
};

export type DiceRollInputCollectionResult = {
  tools: OpenRouterTool[];
  contributions: DiceRollInputContribution[];
  error: string | null;
};

/**
 * Collect DiceRoll nodes connected to a given node via the `in`/`tools` input port.
 *
 * @param options - Collection options.
 * @param options.nodeId - Target node id.
 * @param options.evaluationContext - Evaluation context for resolving input ports.
 */
export function collectDiceRollInputContributions(options: {
  nodeId: string;
  evaluationContext: ZoeEvaluationContext;
}): DiceRollInputCollectionResult {
  const incoming =
    options.evaluationContext.edgesByTarget.get(options.nodeId) ?? [];
  if (incoming.length === 0) {
    return { tools: [], contributions: [], error: null };
  }

  const diceRollEdges = incoming.filter((edge) => {
    if (!edge.targetPort) return true;
    return edge.targetPort === "in" || edge.targetPort === "tools";
  });
  if (diceRollEdges.length === 0) {
    return { tools: [], contributions: [], error: null };
  }

  const orderedIncoming = [...diceRollEdges].sort((a, b) => {
    const sourceCompare = a.source.localeCompare(b.source);
    if (sourceCompare !== 0) return sourceCompare;
    return a.id.localeCompare(b.id);
  });

  const contributions: DiceRollInputContribution[] = [];
  const toolsByName = new Map<string, OpenRouterTool>();

  for (const edge of orderedIncoming) {
    const source = options.evaluationContext.nodesById.get(edge.source);
    if (!source || source.type !== ZoeNodeID.DiceRoll) continue;
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

    const data = source.data as ZoeDiceRollNodeData;
    contributions.push({ nodeId: source.id, data });

    const diceRollTool = getDeveloperToolDefinition(ZoeNodeID.DiceRoll);
    const toolName = diceRollTool.openRouterTool.function.name;
    if (!toolsByName.has(toolName)) {
      toolsByName.set(toolName, diceRollTool.openRouterTool);
    }
  }

  return {
    tools: Array.from(toolsByName.values()),
    contributions,
    error: null,
  };
}
