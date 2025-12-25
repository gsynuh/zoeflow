import { promises as fs } from "node:fs";
import path from "node:path";

const DEFAULT_METADATA_DIR = path.join(
  process.cwd(),
  "content",
  "vectorstores",
  "_metadata",
);

export type ProcessingUsage = {
  model: string;
  operation: "embedding" | "completion";
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  costUsd?: number;
  timestamp: number;
};

export type ProcessingStep =
  | "normalizing"
  | "parsing"
  | "chunking"
  | "enriching"
  | "embedding"
  | "storing";

export type DocumentMetadata = {
  docId: string;
  storeId: string;
  sourceUri: string;
  /**
   * Optional user-provided description to disambiguate the document in retrieval
   * (e.g. author/site, genre, intended use, or domain).
   */
  description?: string;
  /**
   * Optional user-provided author/owner for the document (useful for blog posts,
   * notes, and personal corpora).
   */
  author?: string;
  /**
   * Optional user-provided tags to help group, filter, or disambiguate documents.
   */
  tags?: string[];
  version: string;
  status: "pending" | "processing" | "completed" | "error" | "cancelled";
  chunkCount?: number;
  uploadedAt: number;
  processedAt?: number;
  error?: string;
  usage?: ProcessingUsage[];
  totalCostUsd?: number;
  totalTokens?: number;
  processingStep?: ProcessingStep;
  progress?: {
    current: number;
    total: number;
    step: ProcessingStep;
  };
};

/**
 * Store document metadata.
 */
export async function storeDocumentMetadata(
  metadata: DocumentMetadata,
): Promise<void> {
  await fs.mkdir(DEFAULT_METADATA_DIR, { recursive: true });
  const filePath = path.join(DEFAULT_METADATA_DIR, `${metadata.docId}.json`);
  await fs.writeFile(filePath, JSON.stringify(metadata, null, 2), "utf8");
}

/**
 * Read document metadata.
 */
export async function readDocumentMetadata(
  docId: string,
): Promise<DocumentMetadata | null> {
  try {
    const filePath = path.join(DEFAULT_METADATA_DIR, `${docId}.json`);
    const content = await fs.readFile(filePath, "utf8");
    try {
      return JSON.parse(content) as DocumentMetadata;
    } catch {
      return null;
    }
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

/**
 * List all document metadata, optionally filtered by storeId.
 */
export async function listDocumentMetadata(
  storeId?: string,
): Promise<DocumentMetadata[]> {
  try {
    await fs.mkdir(DEFAULT_METADATA_DIR, { recursive: true });
    const files = await fs.readdir(DEFAULT_METADATA_DIR);
    const jsonFiles = files.filter((f) => f.endsWith(".json"));

    const metadata = await Promise.all(
      jsonFiles.map(async (file) => {
        try {
          const filePath = path.join(DEFAULT_METADATA_DIR, file);
          const content = await fs.readFile(filePath, "utf8");
          return JSON.parse(content) as DocumentMetadata;
        } catch {
          return null;
        }
      }),
    );

    const validMetadata = metadata.filter(
      (m): m is DocumentMetadata =>
        m !== null && (storeId === undefined || m.storeId === storeId),
    );

    return validMetadata.sort((a, b) => b.uploadedAt - a.uploadedAt);
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

/**
 * Update document metadata status.
 */
export async function updateDocumentStatus(
  docId: string,
  status: DocumentMetadata["status"],
  updates?: Partial<DocumentMetadata>,
): Promise<void> {
  const existing = await readDocumentMetadata(docId);
  if (!existing) {
    throw new Error(`Document metadata not found: ${docId}`);
  }

  const updated: DocumentMetadata = {
    ...existing,
    ...updates,
    status,
  };

  await storeDocumentMetadata(updated);
}

/**
 * Find document ID by source URI (original filename).
 * Returns the most recently uploaded document with matching sourceUri.
 *
 * @param sourceUri - Original filename/source URI
 * @param storeId - Optional store ID to filter by
 * @returns Document ID if found, null otherwise
 */
export async function findDocIdBySourceUri(
  sourceUri: string,
  storeId?: string,
): Promise<string | null> {
  try {
    const allMetadata = await listDocumentMetadata(storeId);
    // Find most recent document with matching sourceUri
    const match = allMetadata
      .filter((m) => m.sourceUri === sourceUri)
      .sort((a, b) => b.uploadedAt - a.uploadedAt)[0];
    return match?.docId ?? null;
  } catch {
    return null;
  }
}

/**
 * Delete document metadata.
 */
export async function deleteDocumentMetadata(docId: string): Promise<void> {
  try {
    const filePath = path.join(DEFAULT_METADATA_DIR, `${docId}.json`);
    await fs.unlink(filePath);
  } catch (error) {
    if ((error as { code?: string }).code !== "ENOENT") {
      throw error;
    }
    // File doesn't exist, which is fine
  }
}
