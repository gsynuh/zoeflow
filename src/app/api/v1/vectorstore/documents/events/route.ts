import { NextResponse } from "next/server";

import { readDocumentMetadata } from "@/zoeflow/vectorstore/documentMetadata";
import { documentProcessingRegistry } from "@/zoeflow/vectorstore/documentProcessingRegistry";

export const runtime = "nodejs";

/**
 * Server-Sent Events endpoint for real-time document status updates.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const docIdsParam = searchParams.get("docIds");
  const storeId = searchParams.get("storeId");

  if (!docIdsParam && !storeId) {
    return NextResponse.json(
      { error: "Missing docIds or storeId query parameter." },
      { status: 400 },
    );
  }

  const docIds = docIdsParam ? docIdsParam.split(",") : null;

  // Create a readable stream for SSE
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const sendEvent = (data: unknown) => {
        const message = `data: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(message));
      };

      // Send initial status
      try {
        if (docIds) {
          // Specific documents
          for (const docId of docIds) {
            const metadata = await readDocumentMetadata(docId);
            if (metadata) {
              sendEvent({
                type: "status",
                docId,
                status: metadata.status,
                isProcessing: documentProcessingRegistry.isProcessing(docId),
                processingStep: metadata.processingStep,
                progress: metadata.progress,
                chunkCount: metadata.chunkCount,
                error: metadata.error,
              });
            }
          }
        } else if (storeId) {
          // All documents in store
          const { listDocumentMetadata } =
            await import("@/zoeflow/vectorstore/documentMetadata");
          const documents = await listDocumentMetadata(storeId);
          for (const doc of documents) {
            if (
              doc.status === "processing" ||
              doc.status === "pending" ||
              doc.status === "completed" ||
              doc.status === "error" ||
              doc.status === "cancelled"
            ) {
              sendEvent({
                type: "status",
                docId: doc.docId,
                status: doc.status,
                isProcessing: documentProcessingRegistry.isProcessing(
                  doc.docId,
                ),
                processingStep: doc.processingStep,
                progress: doc.progress,
                chunkCount: doc.chunkCount,
                error: doc.error,
              });
            }
          }
        }
      } catch (error) {
        sendEvent({
          type: "error",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }

      // Poll for updates every 1 second
      const interval = setInterval(async () => {
        try {
          if (docIds) {
            for (const docId of docIds) {
              const metadata = await readDocumentMetadata(docId);
              if (
                metadata &&
                (metadata.status === "pending" ||
                  metadata.status === "processing" ||
                  metadata.status === "completed" ||
                  metadata.status === "error" ||
                  metadata.status === "cancelled")
              ) {
                sendEvent({
                  type: "status",
                  docId,
                  status: metadata.status,
                  isProcessing: documentProcessingRegistry.isProcessing(docId),
                  processingStep: metadata.processingStep,
                  progress: metadata.progress,
                  chunkCount: metadata.chunkCount,
                  error: metadata.error,
                });
              }
            }
          } else if (storeId) {
            const { listDocumentMetadata } =
              await import("@/zoeflow/vectorstore/documentMetadata");
            const documents = await listDocumentMetadata(storeId);
            for (const doc of documents) {
              if (
                doc.status === "processing" ||
                doc.status === "pending" ||
                doc.status === "completed" ||
                doc.status === "error" ||
                doc.status === "cancelled"
              ) {
                sendEvent({
                  type: "status",
                  docId: doc.docId,
                  status: doc.status,
                  isProcessing: documentProcessingRegistry.isProcessing(
                    doc.docId,
                  ),
                  processingStep: doc.processingStep,
                  progress: doc.progress,
                  chunkCount: doc.chunkCount,
                  error: doc.error,
                });
              }
            }
          }
        } catch (error) {
          sendEvent({
            type: "error",
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }, 1000);

      // Clean up on client disconnect
      request.signal.addEventListener("abort", () => {
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
