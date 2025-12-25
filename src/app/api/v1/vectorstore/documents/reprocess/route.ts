import { NextResponse } from "next/server";

import { createVectorStore } from "@/zoeflow/vectorstore";
import { VectorStoreCache } from "@/zoeflow/vectorstore/cache";
import { ChunkEnrichmentCache } from "@/zoeflow/vectorstore/chunkEnrichmentCache";
import {
  readDocumentMetadata,
  updateDocumentStatus,
} from "@/zoeflow/vectorstore/documentMetadata";
import { documentProcessingRegistry } from "@/zoeflow/vectorstore/documentProcessingRegistry";
import { processMarkdownDocument } from "@/zoeflow/vectorstore/documentProcessor";
import { readDocument } from "@/zoeflow/vectorstore/documentStorage";

export const runtime = "nodejs";

type DocumentReprocessRequest = {
  docId: string;
};

/**
 * Reprocess a document from scratch:
 * - cancels any running job
 * - deletes existing chunks for the doc
 * - clears related embedding/enrichment cache entries (best-effort)
 * - starts processing again using the uploaded document content
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<DocumentReprocessRequest>;
    const docId = typeof body.docId === "string" ? body.docId.trim() : "";

    if (!docId) {
      return NextResponse.json(
        { error: "Missing docId in request body." },
        { status: 400 },
      );
    }

    // Cancel any ongoing processing first
    documentProcessingRegistry.cancel(docId);

    const metadata = await readDocumentMetadata(docId);
    if (!metadata) {
      return NextResponse.json(
        { error: `Document not found: ${docId}` },
        { status: 404 },
      );
    }

    // Delete chunks from vector store
    const store = createVectorStore({ storeId: metadata.storeId });
    const allItems = await store.list();
    const chunksToDelete = allItems.filter(
      (item) =>
        (item.metadata &&
          typeof item.metadata.doc_id === "string" &&
          item.metadata.doc_id === docId) ||
        item.id.startsWith(`chunk_${docId}_`),
    );

    const chunkIds = chunksToDelete.map((item) => item.id);
    if (chunkIds.length > 0) {
      await store.delete(chunkIds);
    }

    // Best-effort cache cleanup (both caches can contain unrelated entries).
    const cacheDocMarker = `doc_id: ${docId}`;

    const embeddingCache = new VectorStoreCache();
    await embeddingCache.deleteByFilter((entry) =>
      entry.text.includes(cacheDocMarker),
    );

    const enrichmentCache = new ChunkEnrichmentCache();
    await enrichmentCache.deleteByFilter((entry) => entry.docId === docId);

    // Start processing again with the latest stored version.
    const docContent = await readDocument(docId, metadata.version);
    const controller = documentProcessingRegistry.register(docId);

    setImmediate(() => {
      processDocumentAsync(
        docId,
        metadata.storeId,
        docContent.content,
        metadata.version,
        controller.signal,
      ).catch((error) => {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        if (errorMessage === "Processing cancelled") {
          console.log(`Processing cancelled for document ${docId}`);
        } else {
          console.error(`Failed to reprocess document ${docId}:`, error);
          updateDocumentStatus(docId, "error", {
            error: errorMessage,
            processingStep: undefined,
            progress: undefined,
          }).catch((updateError) => {
            console.error(
              `Failed to update error status for ${docId}:`,
              updateError,
            );
          });
        }
      });
    });

    return NextResponse.json({
      docId,
      reprocessing: true,
      chunksDeleted: chunkIds.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Process a document asynchronously: chunk, embed, and store in vector store.
 */
async function processDocumentAsync(
  docId: string,
  storeId: string,
  content: string,
  version: string,
  signal: AbortSignal,
) {
  try {
    if (signal.aborted) {
      await updateDocumentStatus(docId, "cancelled", {
        error: "Processing was cancelled before it started",
        processingStep: undefined,
        progress: undefined,
      });
      return;
    }

    await updateDocumentStatus(docId, "processing", {
      error: undefined,
      processingStep: undefined,
      progress: undefined,
    });

    await processMarkdownDocument(docId, storeId, content, version, signal);

    if (signal.aborted) {
      await updateDocumentStatus(docId, "cancelled", {
        error: "Processing was cancelled",
        processingStep: undefined,
        progress: undefined,
      });
      return;
    }

    await updateDocumentStatus(docId, "completed", {
      processedAt: Date.now(),
      processingStep: undefined,
      progress: undefined,
    });
  } catch (error) {
    if (
      signal.aborted ||
      (error instanceof Error && error.message === "Processing cancelled")
    ) {
      try {
        await updateDocumentStatus(docId, "cancelled", {
          error: "Processing was cancelled",
          processingStep: undefined,
          progress: undefined,
        });
      } catch (updateError) {
        console.error(
          `Failed to update cancelled status for ${docId}:`,
          updateError,
        );
      }
    } else {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      try {
        await updateDocumentStatus(docId, "error", {
          error: errorMessage,
          processingStep: undefined,
          progress: undefined,
        });
      } catch (updateError) {
        console.error(
          `Failed to update error status for ${docId}:`,
          updateError,
        );
      }
    }
  } finally {
    documentProcessingRegistry.unregister(docId);
  }
}
