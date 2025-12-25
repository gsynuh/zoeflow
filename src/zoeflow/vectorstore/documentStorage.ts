import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

const DEFAULT_DOCUMENTS_DIR = path.join(process.cwd(), "content", "documents");

/**
 * Generate a stable document ID from a file path and optional content hash.
 */
export function createDocumentId(
  sourceUri: string,
  contentHash?: string,
): string {
  const input = contentHash
    ? `${sourceUri}:${contentHash}`
    : `${sourceUri}:${Date.now()}`;
  return createHash("sha256").update(input).digest("hex").substring(0, 16);
}

/**
 * Generate a version identifier (timestamp-based for now).
 */
export function createDocumentVersion(): string {
  return Date.now().toString();
}

/**
 * Store a document file on disk.
 *
 * @param docId - Document identifier
 * @param version - Version identifier
 * @param content - Document content (markdown)
 * @returns Path to stored file
 */
export async function storeDocument(
  docId: string,
  version: string,
  content: string,
): Promise<string> {
  const docDir = path.join(DEFAULT_DOCUMENTS_DIR, docId);
  await fs.mkdir(docDir, { recursive: true });
  const filePath = path.join(docDir, `${version}.md`);
  await fs.writeFile(filePath, content, "utf8");
  return filePath;
}

/**
 * Read a document from disk.
 *
 * @param docId - Document identifier
 * @param version - Version identifier (optional, uses latest if not provided)
 * @returns Document content
 */
export async function readDocument(
  docId: string,
  version?: string,
): Promise<{ content: string; version: string; filePath: string }> {
  const docDir = path.join(DEFAULT_DOCUMENTS_DIR, docId);
  let filePath: string;
  let versionToUse: string;

  if (version) {
    filePath = path.join(docDir, `${version}.md`);
    versionToUse = version;
  } else {
    // Find latest version
    const files = await fs.readdir(docDir);
    const mdFiles = files
      .filter((f) => f.endsWith(".md"))
      .map((f) => ({
        name: f,
        path: path.join(docDir, f),
        version: f.replace(/\.md$/, ""),
      }))
      .sort((a, b) => b.version.localeCompare(a.version));

    if (mdFiles.length === 0) {
      throw new Error(`No document found for docId: ${docId}`);
    }

    filePath = mdFiles[0].path;
    versionToUse = mdFiles[0].version;
  }

  const content = await fs.readFile(filePath, "utf8");
  return { content, version: versionToUse, filePath };
}

/**
 * List all documents in a store.
 *
 * @param storeId - Store identifier (optional, for filtering)
 * @returns Array of document metadata
 */
export async function listDocuments(storeId?: string): Promise<
  Array<{
    docId: string;
    storeId: string;
    sourceUri: string;
    version: string;
    uploadedAt: number;
  }>
> {
  // This would need to read from a metadata registry
  // For now, we'll scan the documents directory
  // In a real implementation, you'd maintain a metadata file
  const documents: Array<{
    docId: string;
    storeId: string;
    sourceUri: string;
    version: string;
    uploadedAt: number;
  }> = [];

  try {
    await fs.mkdir(DEFAULT_DOCUMENTS_DIR, { recursive: true });
    const docDirs = await fs.readdir(DEFAULT_DOCUMENTS_DIR, {
      withFileTypes: true,
    });

    for (const dirent of docDirs) {
      if (!dirent.isDirectory()) continue;

      const docId = dirent.name;
      const docDir = path.join(DEFAULT_DOCUMENTS_DIR, docId);
      const files = await fs.readdir(docDir);
      const mdFiles = files
        .filter((f) => f.endsWith(".md"))
        .map((f) => ({
          version: f.replace(/\.md$/, ""),
          path: path.join(docDir, f),
        }))
        .sort((a, b) => b.version.localeCompare(a.version));

      if (mdFiles.length > 0) {
        const latest = mdFiles[0];
        const stats = await fs.stat(latest.path);
        // Try to read metadata from vector store or use defaults
        documents.push({
          docId,
          storeId: storeId ?? "default", // Would need to read from metadata
          sourceUri: docId, // Would need to read from metadata
          version: latest.version,
          uploadedAt: stats.birthtimeMs,
        });
      }
    }
  } catch (error) {
    // Directory might not exist yet
    if ((error as { code?: string }).code !== "ENOENT") {
      throw error;
    }
  }

  return documents;
}

/**
 * Delete a document and all its versions from disk.
 *
 * @param docId - Document identifier
 */
export async function deleteDocument(docId: string): Promise<void> {
  const docDir = path.join(DEFAULT_DOCUMENTS_DIR, docId);
  try {
    await fs.rm(docDir, { recursive: true, force: true });
  } catch (error) {
    if ((error as { code?: string }).code !== "ENOENT") {
      throw error;
    }
    // Directory doesn't exist, which is fine
  }
}
