import { NextResponse } from "next/server";

import { createVectorStore } from "@/zoeflow/vectorstore";
import { readDocumentMetadata } from "@/zoeflow/vectorstore/documentMetadata";

export const runtime = "nodejs";

type DocumentChunksRequest = {
  docId: string;
  storeId?: string;
};

/**
 * Get all chunks for a specific document.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<DocumentChunksRequest>;
    const docId = typeof body.docId === "string" ? body.docId.trim() : "";

    if (!docId) {
      return NextResponse.json(
        { error: "Missing docId in request body." },
        { status: 400 },
      );
    }

    const store = createVectorStore({ storeId: body.storeId });
    const allItems = await store.list();
    const docMetadata = await readDocumentMetadata(docId);

    // Filter chunks by doc_id in metadata
    const chunks = allItems.filter(
      (item) =>
        (item.metadata &&
          typeof item.metadata.doc_id === "string" &&
          item.metadata.doc_id === docId) ||
        item.id.startsWith(`chunk_${docId}_`),
    );

    // Sort by chunk_index if available
    const sortedChunks = [...chunks].sort((a, b) => {
      const aIndex =
        typeof a.metadata?.chunk_index === "number"
          ? a.metadata.chunk_index
          : -1;
      const bIndex =
        typeof b.metadata?.chunk_index === "number"
          ? b.metadata.chunk_index
          : -1;
      return aIndex - bIndex;
    });

    return NextResponse.json({
      docId,
      storeId: store.storeId,
      chunks: sortedChunks.map((item) => ({
        id: item.id,
        text: item.text,
        metadata: {
          ...(item.metadata ?? {}),
          source_uri:
            typeof item.metadata?.source_uri === "string"
              ? item.metadata.source_uri
              : docMetadata?.sourceUri,
          version:
            typeof item.metadata?.version === "string"
              ? item.metadata.version
              : docMetadata?.version,
        },
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
