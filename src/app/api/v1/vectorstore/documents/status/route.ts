import { NextResponse } from "next/server";

import { readDocumentMetadata } from "@/zoeflow/vectorstore/documentMetadata";
import { documentProcessingRegistry } from "@/zoeflow/vectorstore/documentProcessingRegistry";

export const runtime = "nodejs";

/**
 * Get status for a specific document or all documents in a store.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const docId = searchParams.get("docId");
    const storeId = searchParams.get("storeId") ?? undefined;

    if (docId) {
      // Single document status
      const metadata = await readDocumentMetadata(docId);
      if (!metadata) {
        return NextResponse.json(
          { error: `Document not found: ${docId}` },
          { status: 404 },
        );
      }

      const isProcessing = documentProcessingRegistry.isProcessing(docId);
      const isStuck = metadata.status === "processing" && !isProcessing;

      return NextResponse.json({
        docId,
        status: metadata.status,
        isProcessing,
        isStuck,
        processingStep: metadata.processingStep,
        progress: metadata.progress,
        chunkCount: metadata.chunkCount,
        uploadedAt: metadata.uploadedAt,
        processedAt: metadata.processedAt,
        error: metadata.error,
      });
    }

    // Multiple documents - return all for the store
    const { listDocumentMetadata } =
      await import("@/zoeflow/vectorstore/documentMetadata");
    const documents = await listDocumentMetadata(storeId);

    return NextResponse.json({
      documents: documents.map((doc) => ({
        docId: doc.docId,
        storeId: doc.storeId,
        sourceUri: doc.sourceUri,
        version: doc.version,
        status: doc.status,
        isProcessing: documentProcessingRegistry.isProcessing(doc.docId),
        isStuck:
          doc.status === "processing" &&
          !documentProcessingRegistry.isProcessing(doc.docId),
        chunkCount: doc.chunkCount,
        uploadedAt: doc.uploadedAt,
        processedAt: doc.processedAt,
        processingStep: doc.processingStep,
        progress: doc.progress,
        error: doc.error,
        totalCostUsd: doc.totalCostUsd,
        totalTokens: doc.totalTokens,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
