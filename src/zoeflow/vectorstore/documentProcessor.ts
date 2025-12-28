import { encodingForModel, getEncoding } from "js-tiktoken";

import { requestOpenRouterEmbeddings } from "@/zoeflow/openrouter/embeddings";
import type { OpenRouterEmbeddingsResponse } from "@/zoeflow/openrouter/embeddingsTypes";
import type { OpenRouterUsage } from "@/zoeflow/openrouter/types";
import {
  buildCompletionUsageEvent,
  buildEmbeddingUsageEvent,
} from "@/zoeflow/stats/openrouterUsage";
import { UsageEventSource } from "@/zoeflow/stats/types";
import { recordUsageEvent } from "@/zoeflow/stats/usageLedger";
import { VectorStoreCache } from "@/zoeflow/vectorstore/cache";
import { enrichChunkForEmbedding } from "@/zoeflow/vectorstore/chunkEnrichment";
import { ChunkEnrichmentCache } from "@/zoeflow/vectorstore/chunkEnrichmentCache";
import { ChunkVariant } from "@/zoeflow/vectorstore/chunkVariant";
import {
  ProcessingUsageOperation,
  readDocumentMetadata,
  updateDocumentStatus,
  type ProcessingUsage,
} from "@/zoeflow/vectorstore/documentMetadata";
import { createVectorStoreItemId } from "@/zoeflow/vectorstore/ids";
import { createVectorStore } from "@/zoeflow/vectorstore/vectorStoreFactory";

type Chunk = {
  rawText: string;
  text: string;
  headingPath: string[];
  chunkIndex: number;
  startChar: number;
  endChar: number;
  startLine: number;
  endLine: number;
  contentType: "markdown" | "code" | "table";
  language?: string;
  parentId?: string;
};

/**
 * Build a processing usage entry from an OpenRouter usage payload.
 *
 * @param input - Usage snapshot input.
 */
function buildProcessingUsage(input: {
  model: string;
  operation: ProcessingUsageOperation;
  usage: OpenRouterUsage | undefined;
}): ProcessingUsage | null {
  if (!input.usage) return null;
  return {
    model: input.model,
    operation: input.operation,
    promptTokens: input.usage.prompt_tokens,
    completionTokens: input.usage.completion_tokens,
    totalTokens: input.usage.total_tokens,
    cost: input.usage.cost,
    upstreamCost: input.usage.cost_details?.upstream_inference_cost,
    timestamp: Date.now(),
  };
}

/**
 * Parse markdown into sections based on headings.
 */
function parseMarkdownSections(content: string): Array<{
  heading: string;
  level: number;
  headingPath: string[];
  content: string;
  startChar: number;
  endChar: number;
  startLine: number;
  endLine: number;
}> {
  const lines = content.split("\n");
  const sections: Array<{
    heading: string;
    level: number;
    headingPath: string[];
    content: string;
    startChar: number;
    endChar: number;
    startLine: number;
    endLine: number;
  }> = [];

  let currentSection: {
    heading: string;
    level: number;
    headingPath: string[];
    content: string[];
    startChar: number;
    startLine: number;
  } | null = null;

  let charOffset = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

    if (headingMatch) {
      // Save previous section
      if (currentSection) {
        sections.push({
          heading: currentSection.heading,
          level: currentSection.level,
          headingPath: [...currentSection.headingPath],
          content: currentSection.content.join("\n"),
          startChar: currentSection.startChar,
          endChar: charOffset - 1,
          startLine: currentSection.startLine,
          endLine: i - 1,
        });
      }

      // Start new section
      const level = headingMatch[1].length;
      const heading = headingMatch[2].trim();
      const headingPath: string[] = currentSection
        ? [...currentSection.headingPath.slice(0, level - 1), heading]
        : [heading];

      currentSection = {
        heading,
        level,
        headingPath,
        content: [line],
        startChar: charOffset,
        startLine: i,
      };
    } else if (currentSection) {
      currentSection.content.push(line);
    }

    charOffset += line.length + 1; // +1 for newline
  }

  // Save last section
  if (currentSection) {
    sections.push({
      heading: currentSection.heading,
      level: currentSection.level,
      headingPath: [...currentSection.headingPath],
      content: currentSection.content.join("\n"),
      startChar: currentSection.startChar,
      endChar: charOffset - 1,
      startLine: currentSection.startLine,
      endLine: lines.length - 1,
    });
  }

  // If no sections found, create one for entire document
  if (sections.length === 0) {
    sections.push({
      heading: "Document",
      level: 1,
      headingPath: ["Document"],
      content,
      startChar: 0,
      endChar: content.length - 1,
      startLine: 0,
      endLine: lines.length - 1,
    });
  }

  return sections;
}

/**
 * Parse markdown to identify block boundaries (code fences, tables, lists).
 * Returns array of block ranges that should not be split.
 */
function identifyMarkdownBlocks(text: string): Array<{
  type: "code" | "table" | "list";
  start: number;
  end: number;
}> {
  const blocks: Array<{
    type: "code" | "table" | "list";
    start: number;
    end: number;
  }> = [];
  const lines = text.split("\n");
  let charOffset = 0;
  let inCodeBlock = false;
  let codeBlockStart = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineStart = charOffset;

    // Detect code fence start/end
    const codeFenceMatch = line.match(/^```(\w+)?/);
    if (codeFenceMatch) {
      if (!inCodeBlock) {
        // Start of code block
        inCodeBlock = true;
        codeBlockStart = lineStart;
      } else {
        // End of code block
        inCodeBlock = false;
        blocks.push({
          type: "code",
          start: codeBlockStart,
          end: charOffset + line.length,
        });
      }
      charOffset += line.length + 1;
      continue;
    }

    // Detect tables (lines with | separator)
    if (!inCodeBlock && line.includes("|") && line.trim().startsWith("|")) {
      const tableStart = lineStart;
      let tableEnd = charOffset + line.length;
      // Collect consecutive table lines
      for (let j = i + 1; j < lines.length; j++) {
        const nextLine = lines[j];
        if (
          nextLine.includes("|") &&
          nextLine.trim().startsWith("|") &&
          !nextLine.match(/^\s*\|[\s\-:]+\|/) // Not a separator row
        ) {
          tableEnd += nextLine.length + 1;
        } else {
          break;
        }
      }
      if (tableEnd > tableStart + line.length) {
        blocks.push({
          type: "table",
          start: tableStart,
          end: tableEnd,
        });
      }
    }

    // Detect list items (lines starting with - * + or numbered)
    if (
      !inCodeBlock &&
      (line.match(/^\s*[-*+]\s+/) || line.match(/^\s*\d+\.\s+/))
    ) {
      const listStart = lineStart;
      let listEnd = charOffset + line.length;
      // Collect consecutive list items
      for (let j = i + 1; j < lines.length; j++) {
        const nextLine = lines[j];
        if (
          nextLine.match(/^\s*[-*+]\s+/) ||
          nextLine.match(/^\s*\d+\.\s+/) ||
          (nextLine.trim() === "" && j + 1 < lines.length) // Empty line might continue list
        ) {
          listEnd += nextLine.length + 1;
        } else if (nextLine.trim() === "") {
          // Empty line ends list
          break;
        } else {
          break;
        }
      }
      if (listEnd > listStart + line.length) {
        blocks.push({
          type: "list",
          start: listStart,
          end: listEnd,
        });
      }
    }

    charOffset += line.length + 1;
  }

  // Close any unclosed code block
  if (inCodeBlock) {
    blocks.push({
      type: "code",
      start: codeBlockStart,
      end: text.length,
    });
  }

  return blocks;
}

/**
 * Check if a position is inside a protected block.
 */
function isInProtectedBlock(
  position: number,
  blocks: Array<{ type: string; start: number; end: number }>,
): boolean {
  return blocks.some(
    (block) => position >= block.start && position < block.end,
  );
}

/**
 * Find the best break point before target position, respecting markdown structure.
 */
function findBreakPoint(
  text: string,
  start: number,
  targetEnd: number,
  blocks: Array<{ type: string; start: number; end: number }>,
): number {
  // Don't break inside protected blocks
  if (isInProtectedBlock(targetEnd, blocks)) {
    // Find the end of the current block
    const block = blocks.find((b) => targetEnd >= b.start && targetEnd < b.end);
    if (block) {
      return block.end;
    }
  }

  // Try to break at paragraph boundaries (double newline)
  // Avoid producing tiny "heading-only" chunks by requiring some minimum
  // distance from the start before accepting a breakpoint.
  const MIN_BREAK_CHARS = 200;
  const searchStart = Math.max(start + MIN_BREAK_CHARS, targetEnd - 500); // Look back up to 500 chars
  const doubleNewline = text.lastIndexOf("\n\n", targetEnd - 1);
  if (doubleNewline > searchStart) {
    return doubleNewline + 2;
  }

  // Try to break at sentence boundaries
  const lastPeriod = text.lastIndexOf(". ", targetEnd - 1);
  const lastNewline = text.lastIndexOf("\n", targetEnd - 1);
  const breakPoint = Math.max(lastPeriod, lastNewline);

  if (breakPoint > searchStart) {
    return breakPoint + (lastPeriod > lastNewline ? 2 : 1);
  }

  // Fallback: break at word boundary
  const lastSpace = text.lastIndexOf(" ", targetEnd - 1);
  if (lastSpace > searchStart) {
    return lastSpace + 1;
  }

  return targetEnd;
}

/**
 * Split text into chunks with overlap, using proper tokenization and respecting markdown structure.
 * Per spec: never split inside code fences, keep table headers, preserve list item boundaries.
 */
function splitIntoChunks(
  text: string,
  targetTokens: number = 500,
  overlapTokens: number = 50,
  embeddingModel: string = "text-embedding-3-small",
  baseLineOffset: number = 0,
): Array<{
  text: string;
  startChar: number;
  endChar: number;
  startLine: number;
  endLine: number;
}> {
  // Initialize tokenizer (use cl100k_base for OpenAI models)
  let tokenizer;
  try {
    // Map common embedding models to their encodings
    // Most OpenAI embedding models use cl100k_base encoding
    const modelName =
      embeddingModel.includes("text-embedding-3") ||
      embeddingModel.includes("text-embedding-ada")
        ? "text-embedding-3-small"
        : "text-embedding-3-small"; // Default
    tokenizer = encodingForModel(modelName);
  } catch {
    // Fallback to cl100k_base encoding directly
    tokenizer = getEncoding("cl100k_base");
  }

  // Identify markdown blocks that should not be split
  const blocks = identifyMarkdownBlocks(text);

  const chunks: Array<{
    text: string;
    startChar: number;
    endChar: number;
    startLine: number;
    endLine: number;
  }> = [];
  let start = 0;

  while (start < text.length) {
    // Estimate target end position (rough estimate for binary search)
    const estimatedChars = targetTokens * 4; // Rough estimate
    let targetEnd = Math.min(start + estimatedChars, text.length);

    // Binary search to find position that gives us targetTokens
    let low = start;
    let high = Math.min(start + estimatedChars * 2, text.length);
    let bestEnd = targetEnd;

    // Find the actual token count for different positions
    for (let attempt = 0; attempt < 5; attempt++) {
      const testText = text.substring(start, targetEnd);
      const tokens = tokenizer.encode(testText);
      const tokenCount = tokens.length;

      if (Math.abs(tokenCount - targetTokens) < 20) {
        // Close enough
        bestEnd = targetEnd;
        break;
      }

      if (tokenCount < targetTokens) {
        // Need more text
        low = targetEnd;
        targetEnd = Math.min(
          targetEnd + Math.floor((targetTokens - tokenCount) * 4),
          text.length,
        );
      } else {
        // Too many tokens
        high = targetEnd;
        targetEnd = Math.floor((low + high) / 2);
      }

      if (targetEnd >= text.length) {
        bestEnd = text.length;
        break;
      }
    }

    // Find break point respecting markdown structure
    let chunkEnd = findBreakPoint(text, start, bestEnd, blocks);

    // Ensure we don't break inside protected blocks
    if (isInProtectedBlock(chunkEnd, blocks)) {
      const block = blocks.find((b) => chunkEnd >= b.start && chunkEnd < b.end);
      if (block) {
        chunkEnd = block.end;
      }
    }

    // Ensure minimum chunk size (at least 50% of target)
    const chunkText = text.substring(start, chunkEnd);
    const chunkTokens = tokenizer.encode(chunkText);
    if (chunkTokens.length < targetTokens * 0.5 && chunkEnd < text.length) {
      // Chunk too small, try to extend
      const extendTo = Math.min(start + estimatedChars * 1.5, text.length);
      chunkEnd = findBreakPoint(text, start, extendTo, blocks);
    }

    const finalChunkText = text.substring(start, chunkEnd).trim();
    if (finalChunkText.length > 0) {
      // Calculate line numbers for this chunk
      // Count newlines before start position to get start line
      const startLine =
        baseLineOffset +
        (start > 0 ? text.substring(0, start).split("\n").length - 1 : 0);
      // Count newlines before end position to get end line
      const endLine =
        baseLineOffset +
        (chunkEnd > 0 ? text.substring(0, chunkEnd).split("\n").length - 1 : 0);

      chunks.push({
        text: finalChunkText,
        startChar: start,
        endChar: chunkEnd,
        startLine: Math.max(0, startLine),
        endLine: Math.max(0, endLine),
      });
    }

    // Calculate overlap start position using tokenizer
    // Find the position that gives us approximately overlapTokens
    // Ensure we don't create excessive overlap (max 30% of chunk size)
    const maxOverlapChars = Math.floor((chunkEnd - start) * 0.3);
    let overlapStart = chunkEnd;
    for (
      let checkPos = chunkEnd;
      checkPos > start + maxOverlapChars;
      checkPos -= 10
    ) {
      const testText = text.substring(checkPos, chunkEnd);
      const testTokens = tokenizer.encode(testText);
      if (testTokens.length >= overlapTokens) {
        overlapStart = checkPos;
        break;
      }
    }

    // Ensure minimum chunk size for next chunk (prevent duplicates)
    const minChunkSize = Math.floor(targetTokens * 0.3 * 4); // ~30% of target in chars
    start = Math.max(start + minChunkSize, overlapStart);
    if (start >= text.length) break;
  }

  return chunks;
}

/**
 * Detect content type and language from text.
 */
function detectContentType(text: string): {
  contentType: "markdown" | "code" | "table";
  language?: string;
} {
  // Check for code fences
  if (text.includes("```")) {
    const codeMatch = text.match(/```(\w+)?/);
    return {
      contentType: "code",
      language: codeMatch?.[1],
    };
  }

  // Check for tables
  if (
    text.includes("|") &&
    text.split("\n").some((line) => line.includes("|"))
  ) {
    return { contentType: "table" };
  }

  return { contentType: "markdown" };
}

/**
 * Process a markdown document: chunk, embed, and store in vector store.
 */
export async function processMarkdownDocument(
  docId: string,
  storeId: string,
  content: string,
  version: string,
  signal?: AbortSignal,
): Promise<void> {
  // Check for cancellation
  if (signal?.aborted) {
    throw new Error("Processing cancelled");
  }

  // Read metadata to get sourceUri
  const metadata = await readDocumentMetadata(docId);
  if (!metadata) {
    throw new Error(`Document metadata not found: ${docId}`);
  }

  // Check if document was deleted (metadata might be gone)
  if (signal?.aborted) {
    throw new Error("Processing cancelled");
  }

  const sourceUri = metadata.sourceUri ?? docId;
  const docDescription =
    typeof metadata.description === "string" ? metadata.description : undefined;
  const docAuthor =
    typeof metadata.author === "string" ? metadata.author : undefined;
  const tags = Array.isArray(metadata.tags)
    ? metadata.tags
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.trim())
        .filter(Boolean)
    : [];

  // Step 1: Normalize content
  await updateDocumentStatus(docId, "processing", {
    processingStep: "normalizing",
  });
  if (signal?.aborted) throw new Error("Processing cancelled");

  const normalizedContent = content
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n");

  // Step 2: Extract frontmatter and parse sections
  try {
    await updateDocumentStatus(docId, "processing", {
      processingStep: "parsing",
    });
  } catch (updateError) {
    console.error(`Failed to update parsing status for ${docId}:`, updateError);
  }
  if (signal?.aborted) throw new Error("Processing cancelled");

  // Delay to prevent server overload
  await new Promise((resolve) => setTimeout(resolve, 500));

  const sections = parseMarkdownSections(normalizedContent);

  // Step 3: Chunk sections
  try {
    await updateDocumentStatus(docId, "processing", {
      processingStep: "chunking",
    });
  } catch (updateError) {
    console.error(
      `Failed to update chunking status for ${docId}:`,
      updateError,
    );
  }
  if (signal?.aborted) throw new Error("Processing cancelled");

  // Delay to prevent server overload
  await new Promise((resolve) => setTimeout(resolve, 500));

  const chunks: Chunk[] = [];
  let chunkIndex = 0;

  for (let sectionIdx = 0; sectionIdx < sections.length; sectionIdx++) {
    if (signal?.aborted) throw new Error("Processing cancelled");

    const section = sections[sectionIdx];

    // Skip sections that only contain a heading with no actual content
    // Remove the heading line from content to check if there's meaningful content
    const contentWithoutHeading = section.content
      .split("\n")
      .filter((line) => !line.match(/^#{1,6}\s+/))
      .join("\n")
      .trim();

    // If section only has a heading and no content, skip it
    if (contentWithoutHeading.length === 0) {
      continue;
    }

    // Get embedding model for tokenizer (will be used later for embeddings too)
    const model =
      (process.env.OPENROUTER_EMBEDDING_MODEL ?? "").trim() ||
      "openai/text-embedding-3-small";
    // Extract model name for tokenizer (remove "openai/" prefix if present)
    const modelName = model.replace(/^openai\//, "");
    const sectionChunks = splitIntoChunks(
      section.content,
      500,
      50,
      modelName,
      section.startLine,
    );
    const sectionId = createVectorStoreItemId(`section_${docId}`);

    // Update progress (non-blocking, only every 10 sections to avoid spam)
    if (sectionIdx % 10 === 0 || sectionIdx === sections.length - 1) {
      try {
        await updateDocumentStatus(docId, "processing", {
          processingStep: "chunking",
          progress: {
            current: sectionIdx + 1,
            total: sections.length,
            step: "chunking",
          },
        });
      } catch (updateError) {
        // Don't block processing if status update fails
        console.error(
          `Failed to update chunking progress for ${docId}:`,
          updateError,
        );
      }
    }

    // Small delay every 10 sections to prevent overload
    if (sectionIdx % 10 === 0 && sectionIdx > 0) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    for (const chunkData of sectionChunks) {
      const { contentType, language } = detectContentType(chunkData.text);

      // Build text for embedding with context
      // NOTE: Removed docTitle from chunk text to save tokens and improve embedding quality
      // The heading_path already provides sufficient context hierarchy
      const headingPathStr = section.headingPath.join(" / ");
      const textForEmbedding = [
        `source: ${sourceUri}`,
        `doc_id: ${docId}`,
        `version: ${version}`,
        `section: ${headingPathStr}`,
        ``,
        chunkData.text,
      ].join("\n");

      chunks.push({
        rawText: chunkData.text,
        text: textForEmbedding,
        headingPath: section.headingPath,
        chunkIndex: chunkIndex++,
        startChar: section.startChar + chunkData.startChar,
        endChar: section.startChar + chunkData.endChar,
        startLine: chunkData.startLine,
        endLine: chunkData.endLine,
        contentType,
        language,
        parentId: sectionId,
      });
    }
  }

  if (chunks.length === 0) {
    throw new Error("No chunks generated from document");
  }

  const useAugmentedChunking =
    (process.env.ZOEFLOW_LLM_AUGMENTED_CHUNKING ?? "").trim() === "1";

  const enrichmentPromptVersion = (
    process.env.ZOEFLOW_CHUNK_ENRICHMENT_PROMPT_VERSION ?? "v1"
  ).trim();

  const enrichmentModel = (
    process.env.OPENROUTER_CHUNK_ENRICHMENT_MODEL ?? ""
  ).trim();

  if (useAugmentedChunking && !enrichmentModel) {
    throw new Error(
      "ZOEFLOW_LLM_AUGMENTED_CHUNKING is enabled but OPENROUTER_CHUNK_ENRICHMENT_MODEL is missing.",
    );
  }

  const chunkVariant = useAugmentedChunking
    ? ChunkVariant.Enriched
    : ChunkVariant.Raw;

  const usageEntries: ProcessingUsage[] = [];
  const storedTexts: string[] = chunks.map((chunk) => chunk.rawText);
  const embeddedTexts: string[] = chunks.map((chunk) => chunk.text);

  if (useAugmentedChunking) {
    const lines = normalizedContent.split("\n");

    try {
      await updateDocumentStatus(docId, "processing", {
        processingStep: "enriching",
        progress: {
          current: 0,
          total: chunks.length,
          step: "enriching",
        },
      });
    } catch (updateError) {
      console.error(
        `Failed to update enriching status for ${docId}:`,
        updateError,
      );
    }

    if (signal?.aborted) throw new Error("Processing cancelled");

    const enrichmentCache = new ChunkEnrichmentCache();
    const BATCH_SIZE_ENRICH = 5;

    for (
      let batchStart = 0;
      batchStart < chunks.length;
      batchStart += BATCH_SIZE_ENRICH
    ) {
      if (signal?.aborted) throw new Error("Processing cancelled");

      const batchEnd = Math.min(batchStart + BATCH_SIZE_ENRICH, chunks.length);
      const batchChunks = chunks.slice(batchStart, batchEnd);

      const enriched = await Promise.all(
        batchChunks.map(async (chunk) => {
          const outwardContextText = buildOutwardContext(lines, chunk);
          return enrichChunkForEmbedding(
            {
              docId,
              sourceUri,
              docDescription,
              docAuthor,
              docTags: tags,
              version,
              headingPath: chunk.headingPath,
              contentType: chunk.contentType,
              language: chunk.language,
              rawChunkText: chunk.rawText,
              outwardContextText,
            },
            {
              model: enrichmentModel,
              promptVersion: enrichmentPromptVersion,
              cache: enrichmentCache,
              signal,
              maxOutputChars: 8000,
            },
          );
        }),
      );

      const statsWrites: Array<Promise<void>> = [];

      enriched.forEach((result, idx) => {
        embeddedTexts[batchStart + idx] = result.embeddedText;

        const usageEntry = buildProcessingUsage({
          model: enrichmentModel,
          operation: ProcessingUsageOperation.Completion,
          usage: result.usage,
        });
        if (usageEntry) {
          usageEntries.push(usageEntry);
          if (typeof usageEntry.cost === "number") {
            const event = buildCompletionUsageEvent({
              source: UsageEventSource.DocumentProcessing,
              model: enrichmentModel,
              usage: {
                prompt_tokens: usageEntry.promptTokens,
                completion_tokens: usageEntry.completionTokens,
                total_tokens: usageEntry.totalTokens,
                cost: usageEntry.cost,
                cost_details:
                  typeof usageEntry.upstreamCost === "number"
                    ? { upstream_inference_cost: usageEntry.upstreamCost }
                    : undefined,
              },
              meta: { docId, operation: "enrichment" },
            });
            if (event) {
              statsWrites.push(recordUsageEvent(event));
            }
          }
        }
      });
      if (statsWrites.length > 0) {
        await Promise.all(statsWrites);
      }

      try {
        await updateDocumentStatus(docId, "processing", {
          processingStep: "enriching",
          progress: {
            current: batchEnd,
            total: chunks.length,
            step: "enriching",
          },
        });
      } catch (updateError) {
        console.error(
          `Failed to update enriching progress for ${docId}:`,
          updateError,
        );
      }

      if (batchEnd < chunks.length) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }
  }

  // Step 4: Generate embeddings
  try {
    await updateDocumentStatus(docId, "processing", {
      processingStep: "embedding",
      progress: {
        current: 0,
        total: chunks.length,
        step: "embedding",
      },
    });
  } catch (updateError) {
    console.error(
      `Failed to update embedding status for ${docId}:`,
      updateError,
    );
  }
  if (signal?.aborted) throw new Error("Processing cancelled");

  // Delay to prevent server overload
  await new Promise((resolve) => setTimeout(resolve, 500));

  const model =
    (process.env.OPENROUTER_EMBEDDING_MODEL ?? "").trim() ||
    "openai/text-embedding-3-small";

  // Process chunks in small batches (10 at a time) with delays and frequent progress updates
  // Each batch is embedded, cached, and flushed to disk immediately
  const cache = new VectorStoreCache();
  const BATCH_SIZE = 10; // Process 10 chunks at a time
  const DELAY_BETWEEN_BATCHES_MS = 500; // 500ms delay between batches
  const now = Date.now();

  // Delete old chunks for this document version (only once, before processing)
  const store = createVectorStore({ storeId });
  const existingItems = await store.list();
  const itemsToDelete = existingItems
    .filter(
      (item) =>
        item.metadata &&
        typeof item.metadata.doc_id === "string" &&
        item.metadata.doc_id === docId &&
        typeof item.metadata.version === "string" &&
        item.metadata.version !== version,
    )
    .map((item) => item.id);

  if (itemsToDelete.length > 0) {
    // Delete in batches to avoid memory issues
    const DELETE_BATCH_SIZE = 1000;
    for (let i = 0; i < itemsToDelete.length; i += DELETE_BATCH_SIZE) {
      if (signal?.aborted) throw new Error("Processing cancelled");
      const batch = itemsToDelete.slice(i, i + DELETE_BATCH_SIZE);
      await store.delete(batch);
    }
  }

  // Process chunks in small batches: embed -> cache -> upsert -> flush to disk
  for (
    let batchStart = 0;
    batchStart < chunks.length;
    batchStart += BATCH_SIZE
  ) {
    if (signal?.aborted) throw new Error("Processing cancelled");

    const batchEnd = Math.min(batchStart + BATCH_SIZE, chunks.length);
    const batchChunks = chunks.slice(batchStart, batchEnd);
    const batchEmbeddedTexts = embeddedTexts.slice(batchStart, batchEnd);
    const batchStoredTexts = storedTexts.slice(batchStart, batchEnd);

    // Update progress - embedding step
    try {
      await updateDocumentStatus(docId, "processing", {
        processingStep: "embedding",
        progress: {
          current: batchEnd,
          total: chunks.length,
          step: "embedding",
        },
      });
    } catch (updateError) {
      console.error(
        `Failed to update embedding progress for ${docId}:`,
        updateError,
      );
    }

    // Get cached embeddings for this batch
    const cachedEmbeddings = await cache.getMany(batchEmbeddedTexts, model);

    // Find cache misses
    const cacheMissIndices: number[] = [];
    const cacheMissTexts: string[] = [];
    cachedEmbeddings.forEach((cached, index) => {
      if (cached === null) {
        cacheMissIndices.push(index);
        cacheMissTexts.push(batchEmbeddedTexts[index]);
      }
    });

    // Fetch missing embeddings if any
    const batchEmbeddings: (number[] | null)[] = new Array(
      batchChunks.length,
    ).fill(null);
    if (cacheMissTexts.length > 0) {
      let batchResponse: OpenRouterEmbeddingsResponse;
      try {
        batchResponse = await requestOpenRouterEmbeddings(
          {
            model,
            input:
              cacheMissTexts.length === 1 ? cacheMissTexts[0] : cacheMissTexts,
          },
          { signal },
        );
      } catch (embedError) {
        if (signal?.aborted) {
          throw new Error("Processing cancelled");
        }
        throw new Error(
          `Failed to fetch embeddings: ${embedError instanceof Error ? embedError.message : String(embedError)}`,
        );
      }

      const batchData = Array.isArray(batchResponse.data)
        ? batchResponse.data
        : [];

      if (batchData.length !== cacheMissTexts.length) {
        throw new Error("Embedding response length mismatch");
      }

      // Track usage
      const usageEntry = buildProcessingUsage({
        model,
        operation: ProcessingUsageOperation.Embedding,
        usage: batchResponse.usage,
      });
      if (usageEntry) {
        usageEntries.push(usageEntry);
        if (typeof usageEntry.cost === "number") {
          const event = buildEmbeddingUsageEvent({
            source: UsageEventSource.DocumentProcessing,
            model,
            usage: {
              prompt_tokens: usageEntry.promptTokens,
              total_tokens: usageEntry.totalTokens,
              cost: usageEntry.cost,
              cost_details:
                typeof usageEntry.upstreamCost === "number"
                  ? { upstream_inference_cost: usageEntry.upstreamCost }
                  : undefined,
            },
            meta: { docId, operation: "embedding" },
          });
          if (event) {
            await recordUsageEvent(event);
          }
        }
      }

      // Cache new embeddings (flushes to disk)
      const itemsToCache = batchData.map((item, idx) => ({
        text: cacheMissTexts[idx],
        embedding: item.embedding,
      }));
      await cache.setMany(itemsToCache, model);

      // Store embeddings in correct positions
      for (let i = 0; i < batchData.length; i++) {
        const chunkIdxInBatch = cacheMissIndices[i];
        batchEmbeddings[chunkIdxInBatch] = batchData[i].embedding;
      }
    }

    // Merge cached and new embeddings
    const finalBatchEmbeddings: number[][] = [];
    for (let i = 0; i < batchChunks.length; i++) {
      const cached = cachedEmbeddings[i];
      if (cached !== null) {
        finalBatchEmbeddings.push(cached);
      } else {
        const fetched = batchEmbeddings[i];
        if (!fetched) {
          throw new Error(`Missing embedding for chunk ${batchStart + i}`);
        }
        finalBatchEmbeddings.push(fetched);
      }
    }

    // Update progress - storing step
    try {
      await updateDocumentStatus(docId, "processing", {
        processingStep: "storing",
        progress: {
          current: batchEnd,
          total: chunks.length,
          step: "storing",
        },
      });
    } catch (updateError) {
      console.error(
        `Failed to update storing progress for ${docId}:`,
        updateError,
      );
    }

    // Upsert this batch (flushes to disk immediately)
    await store.upsert(
      batchChunks.map((chunk, batchIndex) => ({
        id: createVectorStoreItemId(`chunk_${docId}_${chunk.chunkIndex}`),
        text: batchStoredTexts[batchIndex] ?? "",
        embedding: finalBatchEmbeddings[batchIndex] ?? [],
        metadata: {
          doc_id: docId,
          source_uri: sourceUri,
          doc_description: docDescription,
          doc_author: docAuthor,
          doc_tags: tags.length > 0 ? tags : undefined,
          version,
          heading_path: chunk.headingPath,
          chunk_index: chunk.chunkIndex,
          start_char: chunk.startChar,
          end_char: chunk.endChar,
          start_line: chunk.startLine,
          end_line: chunk.endLine,
          content_type: chunk.contentType,
          language: chunk.language,
          parent_id: chunk.parentId,
          chunk_variant: chunkVariant,
          vectorized_text: useAugmentedChunking
            ? (batchEmbeddedTexts[batchIndex] ?? undefined)
            : undefined,
          enrichment_prompt_version: useAugmentedChunking
            ? enrichmentPromptVersion
            : undefined,
          created_at: now,
          indexed_at: now,
        },
      })),
    );

    // Delay between batches to prevent overload and show progress
    if (batchEnd < chunks.length) {
      await new Promise((resolve) =>
        setTimeout(resolve, DELAY_BETWEEN_BATCHES_MS),
      );
    }
  }

  // Calculate totals
  const totalTokens = usageEntries.reduce(
    (sum, u) => sum + (u.totalTokens ?? 0),
    0,
  );
  const totalCost = usageEntries.reduce((sum, u) => sum + (u.cost ?? 0), 0);

  // Update metadata with chunk count and usage
  await updateDocumentStatus(docId, "completed", {
    chunkCount: chunks.length,
    processedAt: Date.now(),
    usage: usageEntries.length > 0 ? usageEntries : undefined,
    totalCost: totalCost > 0 ? totalCost : undefined,
    totalTokens: totalTokens > 0 ? totalTokens : undefined,
  });
}

/**
 * Build bounded outward context around a chunk, using the chunk's line range.
 *
 * @param lines - Full document lines (for the same coordinate system as chunk line ranges).
 * @param chunk - Chunk with start/end line metadata.
 */
function buildOutwardContext(lines: string[], chunk: Chunk): string {
  const CONTEXT_LINES_BEFORE = 2;
  const CONTEXT_LINES_AFTER = 2;

  if (lines.length === 0) return "";

  const startLine = Math.max(0, chunk.startLine - CONTEXT_LINES_BEFORE);
  const endLine = Math.min(
    lines.length - 1,
    chunk.endLine + CONTEXT_LINES_AFTER,
  );
  if (startLine > endLine) return "";

  const context = lines
    .slice(startLine, endLine + 1)
    .join("\n")
    .trim();
  if (!context) return "";

  const maxChars = 2000;
  return context.length <= maxChars
    ? context
    : context.slice(0, maxChars - 1).trimEnd() + "…";
}
