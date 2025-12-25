import type { ZoeEvaluationContext } from "@/zoeflow/engine/evaluator";
import { evaluateBooleanInputPort } from "@/zoeflow/engine/inputPorts";
import type { ContextMessageEntry } from "@/zoeflow/openrouter/context";
import type { OpenRouterTool } from "@/zoeflow/openrouter/types";
import { ZoeLLMRole, ZoeNodeID, type ZoeRagNodeData } from "@/zoeflow/types";

import { buildRagSearchOpenRouterTool } from "./developer";

export type RagInputContribution = {
  nodeId: string;
  data: ZoeRagNodeData;
};

export type RagInputCollectionResult = {
  tools: OpenRouterTool[];
  contributions: RagInputContribution[];
  contextMessages: ContextMessageEntry[];
  error: string | null;
};

/**
 * Collect RAG nodes connected to a given node via the `in`/`tools` input port.
 *
 * @param options - Collection options.
 * @param options.nodeId - Target node id.
 * @param options.evaluationContext - Evaluation context for resolving input ports.
 */
export function collectRagInputContributions(options: {
  nodeId: string;
  evaluationContext: ZoeEvaluationContext;
}): RagInputCollectionResult {
  const incoming =
    options.evaluationContext.edgesByTarget.get(options.nodeId) ?? [];
  if (incoming.length === 0) {
    return { tools: [], contributions: [], contextMessages: [], error: null };
  }

  const ragEdges = incoming.filter((edge) => {
    if (!edge.targetPort) return true;
    return edge.targetPort === "in" || edge.targetPort === "tools";
  });
  if (ragEdges.length === 0) {
    return { tools: [], contributions: [], contextMessages: [], error: null };
  }

  const orderedIncoming = [...ragEdges].sort((a, b) => {
    const sourceCompare = a.source.localeCompare(b.source);
    if (sourceCompare !== 0) return sourceCompare;
    return a.id.localeCompare(b.id);
  });

  const contributions: RagInputContribution[] = [];
  const contextMessages: ContextMessageEntry[] = [];

  for (const edge of orderedIncoming) {
    const source = options.evaluationContext.nodesById.get(edge.source);
    if (!source || source.type !== ZoeNodeID.Rag) continue;
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

    const data = source.data as ZoeRagNodeData;
    contributions.push({ nodeId: source.id, data });

    const content =
      typeof data.queryGuidance === "string" ? data.queryGuidance.trim() : "";
    if (content) {
      contextMessages.push({
        role: ZoeLLMRole.System,
        content,
        priority: -50,
        sourceNodeId: source.id,
        isRagFragment: true,
      });
    }
  }

  if (contributions.length === 0) {
    return { tools: [], contributions: [], contextMessages: [], error: null };
  }

  if (contributions.length > 1) {
    return {
      tools: [],
      contributions: [],
      contextMessages: [],
      error:
        "Multiple RAG nodes are connected to the same Completion node (only one is supported).",
    };
  }

  const ragNode = contributions[0];
  return {
    tools: [buildRagSearchOpenRouterTool(ragNode.data)],
    contributions,
    contextMessages,
    error: null,
  };
}
