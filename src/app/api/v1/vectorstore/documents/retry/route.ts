import { NextResponse } from "next/server";

import {
  readDocumentMetadata,
  updateDocumentStatus,
} from "@/zoeflow/vectorstore/documentMetadata";
import { documentProcessingRegistry } from "@/zoeflow/vectorstore/documentProcessingRegistry";
import { processMarkdownDocument } from "@/zoeflow/vectorstore/documentProcessor";
import { readDocument } from "@/zoeflow/vectorstore/documentStorage";

export const runtime = "nodejs";

type DocumentRetryRequest = {
  docId: string;
};

/**
 * Retry/resume processing for a document that's stuck in processing state.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<DocumentRetryRequest>;
    const docId = typeof body.docId === "string" ? body.docId.trim() : "";

    if (!docId) {
      return NextResponse.json(
        { error: "Missing docId in request body." },
        { status: 400 },
      );
    }

    // Read metadata
    const metadata = await readDocumentMetadata(docId);
    if (!metadata) {
      return NextResponse.json(
        { error: `Document not found: ${docId}` },
        { status: 404 },
      );
    }

    // Check if already processing
    if (documentProcessingRegistry.isProcessing(docId)) {
      return NextResponse.json({
        docId,
        message: "Document is already being processed",
        alreadyProcessing: true,
      });
    }

    // Only allow retry if status is "processing", "pending", or "error"
    if (
      metadata.status !== "processing" &&
      metadata.status !== "pending" &&
      metadata.status !== "error"
    ) {
      return NextResponse.json(
        {
          error: `Cannot retry document with status "${metadata.status}". Only "pending", "processing" or "error" documents can be retried.`,
        },
        { status: 400 },
      );
    }

    // Read the document content
    const docContent = await readDocument(docId, metadata.version);

    // Register processing job and trigger async processing
    const controller = documentProcessingRegistry.register(docId);

    // Use setImmediate to defer processing
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
          console.error(`Failed to process document ${docId}:`, error);
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
      retried: true,
      status: "pending",
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
    // Check if already cancelled before starting
    if (signal.aborted) {
      await updateDocumentStatus(docId, "cancelled", {
        error: "Processing was cancelled before it started",
        processingStep: undefined,
        progress: undefined,
      });
      return;
    }

    await updateDocumentStatus(docId, "processing");

    try {
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
    } catch (processingError) {
      throw processingError;
    }
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
