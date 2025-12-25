import type { ZoeEvaluationContext } from "@/zoeflow/engine/evaluator";
import { evaluateBooleanInputPort } from "@/zoeflow/engine/inputPorts";
import {
  getDeveloperToolDefinition,
  type ZoeDeveloperToolDefinition,
} from "@/zoeflow/nodes/tool/developer";
import type { OpenRouterTool } from "@/zoeflow/openrouter/types";
import { ZoeNodeID, type ZoeToolNodeData } from "@/zoeflow/types";

import { buildRagSearchOpenRouterTool } from "../rag/developer";

export type ToolInputContribution = {
  nodeId: string;
  data: ZoeToolNodeData;
  definition: ZoeDeveloperToolDefinition;
};

export type ToolInputCollectionResult = {
  tools: OpenRouterTool[];
  contributions: ToolInputContribution[];
  error: string | null;
};

/**
 * Collect Tool nodes connected to a given node via the `tools` input port.
 *
 * @param options - Collection options.
 * @param options.nodeId - Target node id.
 * @param options.evaluationContext - Evaluation context for resolving input ports.
 */
export function collectToolInputContributions(options: {
  nodeId: string;
  evaluationContext: ZoeEvaluationContext;
}): ToolInputCollectionResult {
  const incoming =
    options.evaluationContext.edgesByTarget.get(options.nodeId) ?? [];
  if (incoming.length === 0) {
    return { tools: [], contributions: [], error: null };
  }

  const toolEdges = incoming.filter((edge) => {
    if (!edge.targetPort) return true;
    return edge.targetPort === "in" || edge.targetPort === "tools";
  });
  if (toolEdges.length === 0) {
    return { tools: [], contributions: [], error: null };
  }

  const orderedIncoming = [...toolEdges].sort((a, b) => {
    const sourceCompare = a.source.localeCompare(b.source);
    if (sourceCompare !== 0) return sourceCompare;
    return a.id.localeCompare(b.id);
  });

  const contributions: ToolInputContribution[] = [];
  const toolsByName = new Map<string, OpenRouterTool>();
  const errors: string[] = [];

  for (const edge of orderedIncoming) {
    const source = options.evaluationContext.nodesById.get(edge.source);
    if (
      !source ||
      (source.type !== ZoeNodeID.Tool && source.type !== ZoeNodeID.GlobalState)
    )
      continue;
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

    // Handle GlobalState nodes separately
    if (source.type === ZoeNodeID.GlobalState) {
      const definition = getDeveloperToolDefinition(ZoeNodeID.GlobalState);
      if (!definition) {
        errors.push(
          `Global State tool definition not found on node ${source.id}.`,
        );
        continue;
      }
      const toolName = definition.openRouterTool.function.name;

      // Inject instructions from node data if present
      const globalStateData = source.data as { instructions?: string };
      const baseDescription = definition.openRouterTool.function.description;
      const instructions = globalStateData.instructions?.trim();
      const enhancedDescription = instructions
        ? `${baseDescription}\n\nGraph-specific instructions:\n${instructions}`
        : baseDescription;

      // Create enhanced tool with instructions
      const enhancedTool = {
        ...definition.openRouterTool,
        function: {
          ...definition.openRouterTool.function,
          description: enhancedDescription,
        },
      };

      if (!toolsByName.has(toolName)) {
        toolsByName.set(toolName, enhancedTool);
      }
      contributions.push({
        nodeId: source.id,
        data: source.data as never,
        definition,
      });
      continue;
    }

    const data = source.data as ZoeToolNodeData;
    const definition = getDeveloperToolDefinition(data.toolKey);
    if (!definition) {
      errors.push(
        `Unknown developer tool "${data.toolKey}" on node ${source.id}.`,
      );
      continue;
    }

    const toolName = definition.openRouterTool.function.name;
    const tool =
      data.toolKey === ZoeNodeID.Rag
        ? buildRagSearchOpenRouterTool(data)
        : definition.openRouterTool;

    if (!toolsByName.has(toolName)) toolsByName.set(toolName, tool);

    contributions.push({
      nodeId: source.id,
      data,
      definition,
    });
  }

  if (errors.length > 0) {
    return { tools: [], contributions: [], error: errors.join("\n") };
  }

  return {
    tools: Array.from(toolsByName.values()),
    contributions,
    error: null,
  };
}
