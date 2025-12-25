import { ZoeNodeID } from "@/zoeflow/types";

import readDocumentInstructions from "@/content/nodes/readDocument/instructions.md";

import type {
  ZoeDeveloperToolDefinition,
  ZoeDeveloperToolExecuteInput,
} from "@/zoeflow/nodes/tool/types";

/**
 * Read Document tool definition.
 */
export const READ_DOCUMENT_TOOL: ZoeDeveloperToolDefinition = {
  key: ZoeNodeID.ReadDocument,
  label: "Read document",
  description:
    "Read a full document or specific section from the vector store by document ID.",
  openRouterTool: {
    type: "function",
    function: {
      name: "read_document",
      description: [
        "Read a full document or specific section from the vector store. Use this after rag_search to get full context for cited sections. Use doc_id from the citation (preferred) or source_uri (original filename) to identify the document.",
        readDocumentInstructions.trim(),
      ]
        .filter(Boolean)
        .join("\n\n"),
      parameters: {
        type: "object",
        properties: {
          doc_id: {
            type: "string",
            description:
              "Document identifier from rag_search citation. This is the preferred way to identify documents. If not provided, source_uri can be used instead.",
          },
          source_uri: {
            type: "string",
            description:
              "Original filename/source URI (e.g., 'document.md'). Use this only if doc_id is not available from the citation. doc_id is preferred.",
          },
          section: {
            type: "string",
            description:
              "Optional: heading path or section identifier to read a specific section.",
          },
          version: {
            type: "string",
            description:
              "Optional: specific document version to read (defaults to latest).",
          },
          start_line: {
            type: "number",
            description:
              "Optional: start line number (0-indexed) to read a specific line range. Use with end_line. Can be used with citations that include start_line/end_line.",
          },
          end_line: {
            type: "number",
            description:
              "Optional: end line number (0-indexed) to read a specific line range. Use with start_line. Can be used with citations that include start_line/end_line.",
          },
        },
        required: [],
      },
    },
  },
  execute: async (input: ZoeDeveloperToolExecuteInput) => {
    const args = input.toolCall.arguments as {
      doc_id?: unknown;
      source_uri?: unknown;
      section?: unknown;
      version?: unknown;
      start_line?: unknown;
      end_line?: unknown;
    };

    const docId =
      typeof args.doc_id === "string" ? args.doc_id.trim() : undefined;
    const sourceUri =
      typeof args.source_uri === "string" ? args.source_uri.trim() : undefined;
    const section =
      typeof args.section === "string" ? args.section.trim() : undefined;
    const version =
      typeof args.version === "string" ? args.version.trim() : undefined;
    const startLine =
      typeof args.start_line === "number" ? args.start_line : undefined;
    const endLine =
      typeof args.end_line === "number" ? args.end_line : undefined;

    if (!docId && !sourceUri) {
      return {
        message:
          "read_document requires either doc_id (preferred, from rag_search citation) or source_uri (original filename).",
        value: {
          error:
            "Missing doc_id or source_uri. Use doc_id from rag_search citation.",
        },
      };
    }

    const response = await fetch("/api/v1/vectorstore/documents/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        docId: docId, // Map doc_id from tool call to docId for API
        sourceUri: sourceUri, // Also support source_uri lookup
        section,
        version,
        start_line: startLine,
        end_line: endLine,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      return {
        message: `Document read failed (${response.status}).`,
        value: { error: body },
      };
    }

    const data = (await response.json()) as {
      docId: string;
      version: string;
      sourceUri: string;
      content: string;
      section?: string | null;
    };

    return {
      message: `Read document "${data.sourceUri}"${data.section ? ` (section: ${data.section})` : ""}.`,
      value: data,
    };
  },
};
