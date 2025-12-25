import { NextResponse } from "next/server";

import {
  storeDocumentMetadata,
  type DocumentMetadata,
} from "@/zoeflow/vectorstore/documentMetadata";
import {
  createDocumentId,
  createDocumentVersion,
  storeDocument,
} from "@/zoeflow/vectorstore/documentStorage";
import { normalizeVectorStoreId } from "@/zoeflow/vectorstore/ids";

export const runtime = "nodejs";

/**
 * Upload a document file for processing.
 */
export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const storeIdRaw = formData.get("storeId") as string | null;

    if (!file) {
      return NextResponse.json(
        { error: "Missing file in upload request." },
        { status: 400 },
      );
    }

    if (
      file.type &&
      !file.type.includes("markdown") &&
      !file.name.endsWith(".md")
    ) {
      return NextResponse.json(
        { error: "Only markdown files (.md) are supported." },
        { status: 400 },
      );
    }

    const normalized = normalizeVectorStoreId(storeIdRaw);
    if (normalized.error || !normalized.value) {
      return NextResponse.json(
        { error: normalized.error ?? "Invalid storeId." },
        { status: 400 },
      );
    }

    // Check file size (limit to 10MB to prevent memory issues)
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB. Your file is ${(file.size / 1024 / 1024).toFixed(2)}MB.`,
        },
        { status: 400 },
      );
    }

    const content = await file.text();
    const contentHash = Buffer.from(content)
      .toString("base64")
      .substring(0, 16);
    const docId = createDocumentId(file.name, contentHash);
    const version = createDocumentVersion();

    // Store document file
    await storeDocument(docId, version, content);

    // Create metadata entry
    const metadata: DocumentMetadata = {
      docId,
      storeId: normalized.value,
      sourceUri: file.name,
      version,
      status: "pending",
      uploadedAt: Date.now(),
    };
    await storeDocumentMetadata(metadata);

    // Return immediately. Processing is started explicitly via `/documents/start`.
    return NextResponse.json({
      docId,
      storeId: normalized.value,
      version,
      status: "pending",
      sourceUri: file.name,
      uploadedAt: metadata.uploadedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
