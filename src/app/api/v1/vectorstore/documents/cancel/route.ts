import { NextResponse } from "next/server";

import { updateDocumentStatus } from "@/zoeflow/vectorstore/documentMetadata";
import { documentProcessingRegistry } from "@/zoeflow/vectorstore/documentProcessingRegistry";

export const runtime = "nodejs";

type DocumentCancelRequest = {
  docId: string;
};

/**
 * Cancel processing for a document.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<DocumentCancelRequest>;
    const docId = typeof body.docId === "string" ? body.docId.trim() : "";

    if (!docId) {
      return NextResponse.json(
        { error: "Missing docId in request body." },
        { status: 400 },
      );
    }

    // Cancel processing
    const wasProcessing = documentProcessingRegistry.cancel(docId);

    if (wasProcessing) {
      // Update metadata status
      try {
        await updateDocumentStatus(docId, "cancelled", {
          error: "Processing cancelled by user",
          processingStep: undefined,
          progress: undefined,
        });
      } catch {
        // Metadata might already be deleted, which is fine
      }
    }

    return NextResponse.json({
      docId,
      cancelled: wasProcessing,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
