import { NextResponse } from "next/server";

import {
  readDocumentMetadata,
  updateDocumentStatus,
} from "@/zoeflow/vectorstore/documentMetadata";
import { documentProcessingRegistry } from "@/zoeflow/vectorstore/documentProcessingRegistry";
import { processMarkdownDocument } from "@/zoeflow/vectorstore/documentProcessor";
import { readDocument } from "@/zoeflow/vectorstore/documentStorage";

export const runtime = "nodejs";

type DocumentStartRequest = {
  docId: string;
  author?: string;
  description?: string;
  tags?: string[] | string;
};

/**
 * Start processing for an uploaded document (after user confirms metadata).
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<DocumentStartRequest>;
    const docId = typeof body.docId === "string" ? body.docId.trim() : "";

    if (!docId) {
      return NextResponse.json(
        { error: "Missing docId in request body." },
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

    if (documentProcessingRegistry.isProcessing(docId)) {
      return NextResponse.json({
        docId,
        message: "Document is already being processed",
        alreadyProcessing: true,
      });
    }

    if (metadata.status !== "pending" && metadata.status !== "error") {
      return NextResponse.json(
        {
          error: `Cannot start processing for document with status "${metadata.status}". Only "pending" or "error" documents can be started.`,
        },
        { status: 400 },
      );
    }

    const author = typeof body.author === "string" ? body.author.trim() : "";
    const description =
      typeof body.description === "string" ? body.description.trim() : "";
    const tags =
      typeof body.tags === "string"
        ? body.tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
        : Array.isArray(body.tags)
          ? body.tags
              .filter((t): t is string => typeof t === "string")
              .map((t) => t.trim())
              .filter(Boolean)
          : [];

    await updateDocumentStatus(docId, "pending", {
      author: author.length > 0 ? author : undefined,
      description: description.length > 0 ? description : undefined,
      tags: tags.length > 0 ? tags : undefined,
      error: undefined,
      processingStep: undefined,
      progress: undefined,
    });

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
      started: true,
      status: "processing",
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

    await updateDocumentStatus(docId, "processing");

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
