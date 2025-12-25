import { NextResponse } from "next/server";

import { readDocumentMetadata } from "@/zoeflow/vectorstore/documentMetadata";
import { documentProcessingRegistry } from "@/zoeflow/vectorstore/documentProcessingRegistry";

export const runtime = "nodejs";

/**
 * Check if a document is actually being processed (has active job).
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const docId = searchParams.get("docId") ?? "";

    if (!docId) {
      return NextResponse.json(
        { error: "Missing docId query parameter." },
        { status: 400 },
      );
    }

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
      uploadedAt: metadata.uploadedAt,
      processingStep: metadata.processingStep,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
