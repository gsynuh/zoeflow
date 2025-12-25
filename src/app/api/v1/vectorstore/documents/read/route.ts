import { NextResponse } from "next/server";

import {
  findDocIdBySourceUri,
  readDocumentMetadata,
} from "@/zoeflow/vectorstore/documentMetadata";
import { readDocument } from "@/zoeflow/vectorstore/documentStorage";

export const runtime = "nodejs";

type DocumentReadRequest = {
  docId?: string;
  sourceUri?: string;
  section?: string;
  version?: string;
  start_line?: number;
  end_line?: number;
};

/**
 * Read a document or specific section for LLM tool calls.
 * Accepts either docId (preferred) or sourceUri (original filename).
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<DocumentReadRequest>;
    let docId = typeof body.docId === "string" ? body.docId.trim() : "";
    const sourceUri =
      typeof body.sourceUri === "string" ? body.sourceUri.trim() : undefined;
    const section =
      typeof body.section === "string" ? body.section.trim() : undefined;
    const version =
      typeof body.version === "string" ? body.version.trim() : undefined;
    const startLine =
      typeof body.start_line === "number" ? body.start_line : undefined;
    const endLine =
      typeof body.end_line === "number" ? body.end_line : undefined;

    // If docId not provided but sourceUri is, look up docId by sourceUri
    if (!docId && sourceUri) {
      const foundDocId = await findDocIdBySourceUri(sourceUri);
      if (!foundDocId) {
        return NextResponse.json(
          {
            error: `Document not found with sourceUri: ${sourceUri}. Use doc_id from rag_search citation instead.`,
          },
          { status: 404 },
        );
      }
      docId = foundDocId;
    }

    if (!docId) {
      return NextResponse.json(
        {
          error:
            "Missing docId or sourceUri in request body. Provide doc_id (from rag_search citation) or source_uri (original filename).",
        },
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

    const { content, version: actualVersion } = await readDocument(
      docId,
      version,
    );

    const lines = content.split("\n");
    let sectionContent = content;

    // Priority: line range > section > full document
    if (startLine !== undefined && endLine !== undefined) {
      // Extract by line range (0-indexed)
      const start = Math.max(0, Math.min(startLine, lines.length - 1));
      const end = Math.max(start, Math.min(endLine + 1, lines.length)); // +1 because slice is exclusive
      sectionContent = lines.slice(start, end).join("\n");
    } else if (section) {
      // Try to extract section by heading path
      // This is a simplified implementation - would need proper AST parsing
      const sectionLines: string[] = [];
      let inSection = false;
      let depth = 0;

      for (const line of lines) {
        const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
        if (headingMatch) {
          const headingLevel = headingMatch[1].length;
          const headingText = headingMatch[2].trim().toLowerCase();

          if (headingText.includes(section.toLowerCase())) {
            inSection = true;
            depth = headingLevel;
            sectionLines.push(line);
          } else if (inSection && headingLevel <= depth) {
            // End of section
            break;
          } else if (inSection) {
            sectionLines.push(line);
          }
        } else if (inSection) {
          sectionLines.push(line);
        }
      }

      if (sectionLines.length > 0) {
        sectionContent = sectionLines.join("\n");
      }
    }

    return NextResponse.json({
      docId,
      version: actualVersion,
      sourceUri: metadata.sourceUri,
      content: sectionContent,
      section: section || null,
      start_line: startLine ?? null,
      end_line: endLine ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
