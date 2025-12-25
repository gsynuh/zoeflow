import { NextResponse } from "next/server";

import { listDocumentMetadata } from "@/zoeflow/vectorstore/documentMetadata";

export const runtime = "nodejs";

/**
 * List documents in a vector store.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get("storeId") ?? undefined;

    const documents = await listDocumentMetadata(storeId);

    return NextResponse.json({
      documents: documents.map((doc) => ({
        docId: doc.docId,
        storeId: doc.storeId,
        sourceUri: doc.sourceUri,
        description: doc.description,
        author: doc.author,
        tags: doc.tags,
        version: doc.version,
        status: doc.status,
        chunkCount: doc.chunkCount,
        uploadedAt: doc.uploadedAt,
        processedAt: doc.processedAt,
        totalCostUsd: doc.totalCostUsd,
        totalTokens: doc.totalTokens,
        processingStep: doc.processingStep,
        progress: doc.progress,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
