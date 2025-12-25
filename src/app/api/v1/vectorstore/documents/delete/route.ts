import { NextResponse } from "next/server";

import { createVectorStore } from "@/zoeflow/vectorstore";
import { VectorStoreCache } from "@/zoeflow/vectorstore/cache";
import { ChunkEnrichmentCache } from "@/zoeflow/vectorstore/chunkEnrichmentCache";
import {
  deleteDocumentMetadata,
  readDocumentMetadata,
} from "@/zoeflow/vectorstore/documentMetadata";
import { documentProcessingRegistry } from "@/zoeflow/vectorstore/documentProcessingRegistry";
import { deleteDocument } from "@/zoeflow/vectorstore/documentStorage";

export const runtime = "nodejs";

type DocumentDeleteRequest = {
  docId: string;
  storeId?: string;
};

/**
 * Delete a document and all associated data.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<DocumentDeleteRequest>;
    const docId = typeof body.docId === "string" ? body.docId.trim() : "";

    if (!docId) {
      return NextResponse.json(
        { error: "Missing docId in request body." },
        { status: 400 },
      );
    }

    // Cancel any ongoing processing first
    documentProcessingRegistry.cancel(docId);

    // Read metadata to get storeId and find chunks
    const metadata = await readDocumentMetadata(docId);
    if (!metadata) {
      return NextResponse.json(
        { error: `Document not found: ${docId}` },
        { status: 404 },
      );
    }

    const storeId = body.storeId ?? metadata.storeId;

    // Find chunks to delete and get their texts BEFORE deleting
    const store = createVectorStore({ storeId });
    const allItems = await store.list();
    const chunksToDelete = allItems.filter(
      (item) =>
        (item.metadata &&
          typeof item.metadata.doc_id === "string" &&
          item.metadata.doc_id === docId) ||
        item.id.startsWith(`chunk_${docId}_`),
    );

    // Get chunk texts BEFORE deleting (best-effort legacy cache cleanup)
    const chunkTexts = chunksToDelete.map((item) => item.text);
    const chunkIds = chunksToDelete.map((item) => item.id);

    // Delete cached embeddings for this document (best-effort)
    const embeddingCache = new VectorStoreCache();
    const cacheDocMarker = `doc_id: ${docId}`;
    await embeddingCache.deleteByFilter((entry) =>
      entry.text.includes(cacheDocMarker),
    );

    // Legacy cleanup for old cache format (where cache keys were raw chunk text)
    if (chunkTexts.length > 0) {
      const model =
        (process.env.OPENROUTER_EMBEDDING_MODEL ?? "").trim() ||
        "openai/text-embedding-3-small";
      await embeddingCache.deleteByFilter((entry) => {
        return (
          entry.model === model &&
          chunkTexts.some((text) => entry.text.trim() === text.trim())
        );
      });
    }

    const enrichmentCache = new ChunkEnrichmentCache();
    await enrichmentCache.deleteByFilter((entry) => entry.docId === docId);

    // Delete chunks from vector store
    if (chunkIds.length > 0) {
      await store.delete(chunkIds);
    }

    // Delete metadata file
    await deleteDocumentMetadata(docId);

    // Delete document files
    await deleteDocument(docId);

    return NextResponse.json({
      docId,
      deleted: true,
      chunksDeleted: chunkIds.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
