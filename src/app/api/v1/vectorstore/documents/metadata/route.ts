import { NextResponse } from "next/server";

import {
  readDocumentMetadata,
  updateDocumentStatus,
} from "@/zoeflow/vectorstore/documentMetadata";

export const runtime = "nodejs";

type DocumentMetadataUpdateRequest = {
  docId: string;
  author?: string;
  description?: string;
  tags?: string[] | string;
};

function normalizeTags(tags: unknown): string[] | undefined {
  const raw =
    typeof tags === "string"
      ? tags
      : Array.isArray(tags)
        ? tags.filter((t): t is string => typeof t === "string").join(",")
        : "";

  const normalized = raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  return normalized.length > 0 ? normalized : undefined;
}

/**
 * Update stored metadata for a document (does not start processing).
 */
export async function POST(request: Request) {
  try {
    const body =
      (await request.json()) as Partial<DocumentMetadataUpdateRequest>;
    const docId = typeof body.docId === "string" ? body.docId.trim() : "";

    if (!docId) {
      return NextResponse.json(
        { error: "Missing docId in request body." },
        { status: 400 },
      );
    }

    const existing = await readDocumentMetadata(docId);
    if (!existing) {
      return NextResponse.json(
        { error: `Document not found: ${docId}` },
        { status: 404 },
      );
    }

    const author = typeof body.author === "string" ? body.author.trim() : "";
    const description =
      typeof body.description === "string" ? body.description.trim() : "";
    const tags = normalizeTags(body.tags);

    await updateDocumentStatus(docId, existing.status, {
      author: author.length > 0 ? author : undefined,
      description: description.length > 0 ? description : undefined,
      tags,
    });

    return NextResponse.json({
      docId,
      updated: true,
      author: author.length > 0 ? author : undefined,
      description: description.length > 0 ? description : undefined,
      tags,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
