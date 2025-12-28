import { RAG_DEFAULTS } from "@/zoeflow/nodes/shared/defaults";
import type {
  ZoeDeveloperToolDefinition,
  ZoeDeveloperToolExecuteInput,
} from "@/zoeflow/nodes/tool/types";
import type { ZoeRagNodeData, ZoeToolNodeData } from "@/zoeflow/types";
import { ZoeNodeID } from "@/zoeflow/types";

import ragQueryGuidance from "@/content/nodes/rag/query-guidance.md";

/**
 * Get a string value from RAG node data, with fallback to Tool node data.
 *
 * @param data - RAG or Tool node data.
 * @param primary - Primary key in RAG node data.
 * @param fallback - Fallback key in Tool node data.
 */
function getRagString(
  data: ZoeRagNodeData | ZoeToolNodeData | { [key: string]: unknown },
  primary: keyof ZoeRagNodeData,
  fallback: keyof ZoeToolNodeData,
) {
  const value =
    (data as ZoeRagNodeData)[primary] ??
    (data as ZoeToolNodeData)[fallback] ??
    undefined;
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Get a number value from RAG node data, with fallback to Tool node data.
 *
 * @param data - RAG or Tool node data.
 * @param primary - Primary key in RAG node data.
 * @param fallback - Fallback key in Tool node data.
 */
function getRagNumber(
  data: ZoeRagNodeData | ZoeToolNodeData | { [key: string]: unknown },
  primary: keyof ZoeRagNodeData,
  fallback: keyof ZoeToolNodeData,
) {
  const value =
    (data as ZoeRagNodeData)[primary] ??
    (data as ZoeToolNodeData)[fallback] ??
    undefined;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Get min score from RAG node data.
 *
 * @param data - RAG node data.
 */
function getRagMinScore(
  data: ZoeRagNodeData | ZoeToolNodeData | { [key: string]: unknown },
) {
  const value = getRagNumber(data, "minScore", "ragMinScore");
  if (value === null) return RAG_DEFAULTS.minScore;
  return Math.max(0, Math.min(1, value));
}

/**
 * Get max queries from RAG node data.
 *
 * @param data - RAG node data.
 */
export function getRagMaxQueries(
  data: ZoeRagNodeData | ZoeToolNodeData | { [key: string]: unknown },
) {
  const value =
    (data as ZoeRagNodeData).maxQueries ??
    (data as ZoeToolNodeData).ragMaxQueries ??
    undefined;
  if (typeof value !== "number" || !Number.isFinite(value))
    return RAG_DEFAULTS.maxQueries;
  return Math.max(1, Math.min(RAG_DEFAULTS.maxQueriesCap, value));
}

/**
 * Build an OpenRouter tool definition for the RAG search tool, incorporating node configuration.
 *
 * @param data - Node data (RAG or Tool node).
 */
export function buildRagSearchOpenRouterTool(
  data: ZoeRagNodeData | ZoeToolNodeData | { [key: string]: unknown },
) {
  const maxQueries = getRagMaxQueries(data);
  const maxLabel = `up to ${maxQueries}`;

  const base = RAG_SEARCH_TOOL.openRouterTool;

  const description = [
    `Search a vector store for relevant context using ${maxLabel} natural-language queries.`,
    ragQueryGuidance.trim(),
  ]
    .map((entry) => entry.trim())
    .filter(Boolean)
    .join("\n\n");

  return {
    ...base,
    function: {
      ...base.function,
      description,
      parameters: {
        type: "object",
        properties: {
          queries: {
            type: "array",
            items: { type: "string" },
            maxItems: maxQueries,
            description: `${maxLabel} natural-language search queries.`,
          },
        },
        required: ["queries"],
      },
    },
  };
}

/**
 * RAG Search tool definition.
 */
export const RAG_SEARCH_TOOL: ZoeDeveloperToolDefinition = {
  key: ZoeNodeID.Rag,
  label: "RAG search",
  description:
    "Query the server-side vector store for the most relevant entries to a natural language query.",
  openRouterTool: {
    type: "function",
    function: {
      name: "rag_search",
      description: [
        "Search a vector store for relevant context using one or more natural-language queries.",
        ragQueryGuidance.trim(),
      ]
        .filter(Boolean)
        .join("\n\n"),
      parameters: {
        type: "object",
        properties: {
          queries: {
            type: "array",
            items: { type: "string" },
            description: "Natural-language search queries.",
          },
        },
        required: ["queries"],
      },
    },
  },
  execute: async (input: ZoeDeveloperToolExecuteInput) => {
    const args = input.toolCall.arguments as {
      queries?: unknown;
      query?: unknown;
    };
    const rawQueries = Array.isArray(args?.queries)
      ? args.queries
      : typeof args?.query === "string"
        ? [args.query]
        : [];
    const maxQueries = getRagMaxQueries(input.data);
    const queries = rawQueries
      .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
      .filter((entry) => entry.length > 0)
      .slice(0, maxQueries);

    if (queries.length === 0) {
      return {
        message: "RAG search requires at least one query (provide `queries`).",
        value: { error: "Missing queries." },
      };
    }

    const storeId =
      getRagString(input.data, "storeId", "ragStoreId") || "default";
    const model =
      getRagString(input.data, "embeddingModel", "ragEmbeddingModel") ||
      undefined;
    const topK = getRagNumber(input.data, "topK", "ragTopK") ?? 5;
    const minScore = getRagMinScore(input.data);

    const response = await fetch("/api/v1/vectorstore/query-many", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        storeId,
        queries,
        model,
        topK: Math.min(5, Math.max(1, topK)),
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      return {
        message: `RAG search failed (${response.status}).`,
        value: { error: body },
      };
    }

    const data = (await response.json()) as {
      results?: Array<{
        id: string;
        text: string;
        metadata?: Record<string, unknown>;
        score: number; // RRF score for ranking
        similarityScore?: number; // Original similarity score for filtering
      }>;
      embedding?: {
        model?: string;
        usage?: {
          prompt_tokens?: number;
          total_tokens?: number;
          cost?: number;
          cost_details?: { upstream_inference_cost?: number };
        } | null;
      };
    };

    const results = Array.isArray(data.results) ? data.results : [];

    const sanitizedResults = results.map((result) => ({
      ...result,
      metadata: sanitizeRagMetadata(result.metadata),
    }));

    // Filter by similarityScore if available (RRF results), otherwise fall back to score
    const filteredResults = sanitizedResults.filter((result) => {
      const scoreToCheck =
        typeof result.similarityScore === "number"
          ? result.similarityScore
          : result.score;
      return typeof scoreToCheck === "number" && scoreToCheck >= minScore;
    });

    // Format results with citations
    const resultsWithCitations = filteredResults.map((result, index) => {
      const metadata = result.metadata ?? {};
      const headingPath = Array.isArray(metadata.heading_path)
        ? metadata.heading_path.join(" / ")
        : typeof metadata.heading_path === "string"
          ? metadata.heading_path
          : "";

      const citation = {
        // doc_id is the primary identifier for read_document tool
        doc_id: typeof metadata.doc_id === "string" ? metadata.doc_id : "",
        // source_uri is the original filename (for display/citations, can also be used with read_document)
        source_uri:
          typeof metadata.source_uri === "string" ? metadata.source_uri : "",
        version: typeof metadata.version === "string" ? metadata.version : "",
        heading_path: headingPath,
        start_line:
          typeof metadata.start_line === "number"
            ? metadata.start_line
            : undefined,
        end_line:
          typeof metadata.end_line === "number" ? metadata.end_line : undefined,
        content_type:
          typeof metadata.content_type === "string"
            ? metadata.content_type
            : undefined,
      };

      return {
        ...result,
        rank: index + 1,
        citation,
      };
    });

    // Format results for chat panel display
    const formattedResults = formatRagResultsForChat(
      queries,
      resultsWithCitations,
    );

    return {
      message: formattedResults,
      value: { queries, results: resultsWithCitations },
      usage: data.embedding?.usage
        ? {
            promptTokens: data.embedding.usage.prompt_tokens ?? 0,
            completionTokens: 0,
            totalTokens:
              data.embedding.usage.total_tokens ??
              data.embedding.usage.prompt_tokens ??
              0,
            cost: data.embedding.usage.cost,
            upstreamCost:
              data.embedding.usage.cost_details?.upstream_inference_cost,
          }
        : undefined,
      usageModel:
        typeof data.embedding?.model === "string"
          ? data.embedding.model
          : model,
    };
  },
};

function sanitizeRagMetadata(metadata: unknown): Record<string, unknown> {
  if (!metadata || typeof metadata !== "object") return {};
  const record = metadata as Record<string, unknown>;

  const allowedKeys = new Set([
    "doc_id",
    "source_uri",
    "version",
    "heading_path",
    "start_line",
    "end_line",
    "language",
    "parent_id",
    "doc_author",
    "doc_description",
    "doc_tags",
  ]);

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (!allowedKeys.has(key)) continue;
    if (value === undefined) continue;
    sanitized[key] = value;
  }

  return sanitized;
}

/**
 * Format RAG search results for display in the chat panel.
 *
 * @param queries - Search queries that were executed.
 * @param results - RAG search results with citations.
 */
function formatRagResultsForChat(
  queries: string[],
  results: Array<{
    id: string;
    text: string;
    score: number;
    rank?: number;
    citation?: {
      source_uri: string;
      version: string;
      heading_path: string;
      doc_id: string;
      start_line?: number;
      end_line?: number;
      chunk_index?: number;
      content_type?: string;
    };
  }>,
): string {
  const lines: string[] = [];
  lines.push(
    `## RAG Search Results (${results.length} result${results.length !== 1 ? "s" : ""})`,
  );
  lines.push("");
  lines.push(`**Queries:** ${queries.map((q) => `"${q}"`).join(", ")}`);
  lines.push("");

  if (results.length === 0) {
    lines.push("No results found.");
    return lines.join("\n");
  }

  results.forEach((result, idx) => {
    const rank = result.rank ?? idx + 1;
    const score = (result.score * 100).toFixed(1);
    const citation = result.citation;

    lines.push(`### Result ${rank} (${score}% relevance)`);
    lines.push("");

    if (citation) {
      lines.push(`**Source:** ${citation.source_uri || "unknown"}`);
      if (citation.heading_path) {
        lines.push(`**Section:** ${citation.heading_path}`);
      }
      if (citation.doc_id) {
        lines.push(`**Document ID:** \`${citation.doc_id}\``);
      }
      if (
        citation.start_line !== undefined &&
        citation.end_line !== undefined
      ) {
        lines.push(
          `**Lines:** ${citation.start_line + 1}-${citation.end_line + 1}`,
        );
      }
      if (citation.content_type) {
        lines.push(`**Type:** ${citation.content_type}`);
      }
      lines.push("");
    }

    lines.push("**Content:**");
    lines.push("```");
    lines.push(result.text);
    lines.push("```");
    lines.push("");
  });

  return lines.join("\n");
}
