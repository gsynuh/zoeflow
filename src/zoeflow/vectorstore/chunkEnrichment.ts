import { createHash } from "node:crypto";

import { requestOpenRouterCompletion } from "@/zoeflow/openrouter/client";
import type { OpenRouterCompletionResponse } from "@/zoeflow/openrouter/types";
import { ZoeLLMRole } from "@/zoeflow/types";
import { ChunkEnrichmentCache } from "@/zoeflow/vectorstore/chunkEnrichmentCache";

import enrichmentInstructions from "@/content/nodes/rag/enrichment.md";

enum CONTENT_ID {
  //bit flag
  DOC_ID = 1 << 0,
  SOURCE_URI = 1 << 1,
  VERSION = 1 << 2,
  HEADING_PATH = 1 << 3,
  AUTHOR = 1 << 4,
  DESCRIPTION = 1 << 5,
  TAGS = 1 << 6,
  CONTENT_TYPE = 1 << 7,
  SUMMARY = 1 << 8,
  KEY_POINTS = 1 << 9,
  KEYWORDS = 1 << 10,
  ENTITIES = 1 << 11,
  POSSIBLE_QUERIES = 1 << 12,
}

const ENRICHMENT_WITH =
  //CONTENT_ID.DOC_ID |
  CONTENT_ID.SOURCE_URI |
  //CONTENT_ID.VERSION |
  CONTENT_ID.HEADING_PATH |
  CONTENT_ID.AUTHOR |
  CONTENT_ID.DESCRIPTION |
  CONTENT_ID.TAGS |
  CONTENT_ID.SUMMARY |
  //CONTENT_ID.KEY_POINTS |
  //CONTENT_ID.KEYWORDS |
  //CONTENT_ID.ENTITIES |
  CONTENT_ID.POSSIBLE_QUERIES;

export type ChunkEnrichmentInput = {
  docId: string;
  sourceUri: string;
  docDescription?: string;
  docAuthor?: string;
  docTags?: string[];
  version: string;
  headingPath: string[];
  contentType: "markdown" | "code" | "table";
  language?: string;
  rawChunkText: string;
  outwardContextText?: string;
};

export type ChunkEnrichmentOptions = {
  model: string;
  promptVersion: string;
  cache: ChunkEnrichmentCache;
  signal?: AbortSignal;
  maxOutputChars?: number;
};

type ChunkEnrichmentPayload = {
  summary?: string;
  key_points?: string[];
  keywords?: string[];
  entities?: string[];
  possible_queries?: string[];
};

/**
 * Build a compact, enriched string to embed for a chunk.
 *
 * The returned string is intended for semantic retrieval, while provenance
 * and exact quoting are still driven by doc_id/version + ranges.
 */
export async function enrichChunkForEmbedding(
  input: ChunkEnrichmentInput,
  options: ChunkEnrichmentOptions,
): Promise<{
  embeddedText: string;
  usage?: OpenRouterCompletionResponse["usage"];
}> {
  const normalizedModel = options.model.trim();
  if (!normalizedModel) {
    throw new Error(
      "Missing enrichment model (OPENROUTER_CHUNK_ENRICHMENT_MODEL).",
    );
  }

  const cacheKey = createEnrichmentCacheKey(
    input,
    normalizedModel,
    options.promptVersion,
  );
  const cached = await options.cache.get(cacheKey);
  if (cached) {
    return { embeddedText: cached };
  }

  const completion = await requestOpenRouterCompletion(
    {
      model: normalizedModel,
      temperature: 0.2,
      messages: [
        {
          role: ZoeLLMRole.System,
          content: buildSystemPrompt(options.promptVersion),
        },
        {
          role: ZoeLLMRole.User,
          content: buildUserPrompt(input),
        },
      ],
    },
    { signal: options.signal },
  );

  const content = completion.choices?.[0]?.message?.content ?? "";
  const payload = safeParseEnrichmentPayload(content);

  const embeddedText = clampString(
    renderEmbeddedText(input, payload),
    options.maxOutputChars ?? 8000,
  );

  await options.cache.set(cacheKey, {
    embeddedText,
    model: normalizedModel,
    promptVersion: options.promptVersion,
    docId: input.docId,
    version: input.version,
  });

  return { embeddedText, usage: completion.usage };
}

/**
 * Build the system prompt for chunk enrichment.
 *
 * @param promptVersion - Version identifier for cache invalidation
 * @returns System prompt string with version injected
 */
function buildSystemPrompt(promptVersion: string): string {
  const basePrompt = enrichmentInstructions.trim();
  return `${basePrompt}\n\nPrompt version: ${promptVersion}`;
}

function buildUserPrompt(input: ChunkEnrichmentInput): string {
  const headingPath = input.headingPath.length > 0 ? input.headingPath : [];
  const outwardContext = (input.outwardContextText ?? "").trim();
  const docDescription = (input.docDescription ?? "").trim();
  const docAuthor = (input.docAuthor ?? "").trim();
  const docTags = Array.isArray(input.docTags)
    ? input.docTags.map((t) => t.trim()).filter(Boolean)
    : [];

  const parts: string[] = [];
  parts.push(`SOURCE_URI: ${input.sourceUri}`);
  parts.push(`DOC_ID: ${input.docId}`);
  parts.push(`VERSION: ${input.version}`);
  parts.push(`HEADING_PATH: ${headingPath.join(" > ")}`);
  parts.push(
    `CONTENT_TYPE: ${input.contentType}${input.language ? ` (${input.language})` : ""}`,
  );
  if (docAuthor) parts.push(`DOCUMENT_AUTHOR: ${docAuthor}`);
  if (docDescription) parts.push(`DOCUMENT_DESCRIPTION: ${docDescription}`);
  if (docTags.length > 0) parts.push(`DOCUMENT_TAGS: ${docTags.join(", ")}`);
  parts.push("");
  parts.push("CHUNK:");
  parts.push(input.rawChunkText.trim());

  if (outwardContext) {
    parts.push("");
    parts.push("OUTWARD_CONTEXT (may include nearby lines / headings):");
    parts.push(outwardContext);
  }

  return parts.join("\n");
}

function safeParseEnrichmentPayload(raw: string): ChunkEnrichmentPayload {
  const trimmed = raw.trim();
  const jsonCandidate = extractFirstJsonObject(trimmed) ?? trimmed;
  try {
    const parsed = JSON.parse(jsonCandidate) as unknown;
    if (!parsed || typeof parsed !== "object") return {};

    const asRecord = parsed as Record<string, unknown>;
    return {
      summary:
        typeof asRecord.summary === "string" ? asRecord.summary : undefined,
      key_points: Array.isArray(asRecord.key_points)
        ? asRecord.key_points.filter((v): v is string => typeof v === "string")
        : undefined,
      keywords: Array.isArray(asRecord.keywords)
        ? asRecord.keywords.filter((v): v is string => typeof v === "string")
        : undefined,
      entities: Array.isArray(asRecord.entities)
        ? asRecord.entities.filter((v): v is string => typeof v === "string")
        : undefined,
      possible_queries: Array.isArray(asRecord.possible_queries)
        ? asRecord.possible_queries.filter(
            (v): v is string => typeof v === "string",
          )
        : undefined,
    };
  } catch {
    return {};
  }
}

function extractFirstJsonObject(text: string): string | null {
  const firstBrace = text.indexOf("{");
  if (firstBrace < 0) return null;
  const lastBrace = text.lastIndexOf("}");
  if (lastBrace <= firstBrace) return null;
  return text.slice(firstBrace, lastBrace + 1);
}

function renderEmbeddedText(
  input: ChunkEnrichmentInput,
  payload: ChunkEnrichmentPayload,
): string {
  const lines: string[] = [];
  const headingPath = input.headingPath.join(" > ");
  const docAuthor = (input.docAuthor ?? "").trim();
  const docDescription = (input.docDescription ?? "").trim();
  const docTags = Array.isArray(input.docTags)
    ? input.docTags.map((t) => t.trim()).filter(Boolean)
    : [];

  //USE ENRICHMENT_WITH TO BUILD LINES

  if (ENRICHMENT_WITH & CONTENT_ID.SOURCE_URI) {
    lines.push(`source: ${input.sourceUri}`);
  }
  if (ENRICHMENT_WITH & CONTENT_ID.DOC_ID) {
    lines.push(`doc_id: ${input.docId}`);
  }
  if (ENRICHMENT_WITH & CONTENT_ID.VERSION) {
    lines.push(`version: ${input.version}`);
  }

  lines.push(`document fragment from ${input.sourceUri}`);

  if (ENRICHMENT_WITH & CONTENT_ID.HEADING_PATH)
    if (headingPath) lines.push(`page: ${headingPath}`);

  if (ENRICHMENT_WITH & CONTENT_ID.AUTHOR)
    if (docAuthor) lines.push(`by: ${docAuthor}`);

  if (ENRICHMENT_WITH & CONTENT_ID.DESCRIPTION)
    if (docDescription) lines.push(`doc desc: ${docDescription}`);

  if (ENRICHMENT_WITH & CONTENT_ID.TAGS)
    if (docTags.length > 0) lines.push(`tags: ${docTags.join(", ")}`);

  if (ENRICHMENT_WITH & CONTENT_ID.CONTENT_TYPE)
    lines.push(
      `type: ${input.contentType}${input.language ? ` (${input.language})` : ""}`,
    );

  let summary: string | undefined;

  if (ENRICHMENT_WITH & CONTENT_ID.SUMMARY) {
    summary = payload.summary?.trim();
    if (summary) {
      lines.push("");
      lines.push(`summary: ${summary}`);
    }
  }

  let keyPoints: string[] = [];

  if (ENRICHMENT_WITH & CONTENT_ID.KEY_POINTS) {
    keyPoints = (payload.key_points ?? [])
      .map((v) => v.trim())
      .filter(Boolean)
      .slice(0, 8);
    if (keyPoints.length > 0) {
      lines.push("");
      lines.push("key_points:");
      keyPoints.forEach((p) => lines.push(`- ${p}`));
    }
  }

  if (ENRICHMENT_WITH & CONTENT_ID.KEYWORDS) {
    const keywords = (payload.keywords ?? [])
      .map((v) => v.trim())
      .filter(Boolean)
      .slice(0, 15);
    if (keywords.length > 0) {
      lines.push("");
      lines.push(`keywords: ${keywords.join(", ")}`);
    }
  }

  if (ENRICHMENT_WITH & CONTENT_ID.ENTITIES) {
    const entities = (payload.entities ?? [])
      .map((v) => v.trim())
      .filter(Boolean)
      .slice(0, 10);
    if (entities.length > 0) {
      lines.push(`mentioned: ${entities.join(", ")}`);
    }
  }

  if (ENRICHMENT_WITH & CONTENT_ID.POSSIBLE_QUERIES) {
    const questions = (payload.possible_queries ?? [])
      .map((v) => v.trim())
      .filter(Boolean)
      .slice(0, 5);
    if (questions.length > 0) {
      lines.push("");
      lines.push("relevant to queries like:");
      questions.forEach((q) => lines.push(`- ${q}`));
    }
  }

  if (!summary && keyPoints.length === 0) {
    lines.push("");
    lines.push("text:");
    lines.push(clampString(input.rawChunkText.trim(), 1500));
  }

  return lines.join("\n").trim();
}

function createEnrichmentCacheKey(
  input: ChunkEnrichmentInput,
  model: string,
  promptVersion: string,
): string {
  const hash = createHash("sha256")
    .update(model)
    .update("\n")
    .update(promptVersion)
    .update("\n")
    .update(input.docId)
    .update("\n")
    .update(input.version)
    .update("\n")
    .update(String(input.headingPath.join(" > ")))
    .update("\n")
    .update(input.contentType)
    .update("\n")
    .update(input.language ?? "")
    .update("\n")
    .update(input.rawChunkText)
    .update("\n")
    .update(input.outwardContextText ?? "")
    .digest("hex");

  return `${model}:${promptVersion}:${hash}`;
}

function clampString(value: string, maxChars: number): string {
  if (!Number.isFinite(maxChars) || maxChars <= 0) return "";
  if (value.length <= maxChars) return value;
  return value.slice(0, Math.max(0, maxChars - 1)).trimEnd() + "…";
}
