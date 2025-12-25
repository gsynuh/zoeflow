import { promises as fs } from "node:fs";
import path from "node:path";

import {
  createVectorStoreItemId,
  normalizeVectorStoreId,
} from "@/zoeflow/vectorstore/ids";
import { cosineSimilarity, vectorNorm } from "@/zoeflow/vectorstore/math";
import {
  VectorStoreFormatVersion,
  type VectorStoreFile,
  type VectorStoreItem,
  type VectorStoreQueryResult,
} from "@/zoeflow/vectorstore/types";

const DEFAULT_VECTORSTORE_DIR = path.join(
  process.cwd(),
  "content",
  "vectorstores",
);

type JsonVectorStoreOptions = {
  storeId?: string;
  rootDir?: string;
};

/**
 * JSON-backed vector store persisted on the server filesystem.
 */
export class JsonVectorStore {
  readonly storeId: string;
  readonly filePath: string;

  constructor(options?: JsonVectorStoreOptions) {
    const normalized = normalizeVectorStoreId(options?.storeId);
    if (normalized.error || !normalized.value) {
      throw new Error(normalized.error ?? "Invalid storeId.");
    }

    const rootDir = options?.rootDir ?? DEFAULT_VECTORSTORE_DIR;
    this.storeId = normalized.value;
    this.filePath = path.join(rootDir, `${this.storeId}.json`);
  }

  /**
   * Load the vector store from disk (or initialize a new one).
   */
  async load(): Promise<VectorStoreFile> {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      return this.normalizeFile(JSON.parse(raw) as unknown);
    } catch (error) {
      if (isMissingFileError(error)) {
        return this.createEmptyFile();
      }
      throw error;
    }
  }

  /**
   * Upsert items into the store, persisting to disk.
   *
   * @param items - Items to add or replace by id.
   */
  async upsert(
    items: Array<{
      id?: string;
      text: string;
      embedding: number[];
      metadata?: Record<string, unknown>;
    }>,
  ) {
    if (items.length === 0) return { inserted: 0, updated: 0 };

    const store = await this.load();
    const now = Date.now();

    const byId = new Map(store.items.map((item) => [item.id, item]));
    let inserted = 0;
    let updated = 0;

    for (const input of items) {
      if (
        !input ||
        typeof input.text !== "string" ||
        input.text.trim().length === 0
      ) {
        throw new Error("Vector store upsert requires non-empty text.");
      }
      if (!Array.isArray(input.embedding) || input.embedding.length === 0) {
        throw new Error(
          "Vector store upsert requires a non-empty embedding vector.",
        );
      }

      if (store.dimension === null) {
        store.dimension = input.embedding.length;
      } else if (store.dimension !== input.embedding.length) {
        throw new Error(
          `Embedding dimension mismatch (store=${store.dimension}, item=${input.embedding.length}).`,
        );
      }

      const id =
        typeof input.id === "string" && input.id.trim().length > 0
          ? input.id.trim()
          : createVectorStoreItemId();
      const previous = byId.get(id);
      const next: VectorStoreItem = {
        id,
        text: input.text,
        embedding: input.embedding,
        embeddingNorm: vectorNorm(input.embedding),
        metadata: input.metadata,
        createdAt: previous?.createdAt ?? now,
        updatedAt: now,
      };

      if (previous) {
        updated += 1;
      } else {
        inserted += 1;
      }
      byId.set(id, next);
    }

    store.items = Array.from(byId.values()).sort((a, b) =>
      a.id.localeCompare(b.id),
    );
    await this.save(store);

    return { inserted, updated };
  }

  /**
   * Query the store by embedding and return the top matches by cosine similarity.
   *
   * @param embedding - Query embedding vector.
   * @param topK - Number of results to return.
   */
  async query(
    embedding: number[],
    topK: number,
  ): Promise<VectorStoreQueryResult[]> {
    const store = await this.load();
    return queryLoadedStore(store, embedding, topK);
  }

  /**
   * Query the store by multiple embeddings and return the top matches per query.
   *
   * @param embeddings - Query embedding vectors.
   * @param topK - Number of results to return per query.
   */
  async queryMany(embeddings: number[][], topK: number) {
    const store = await this.load();
    return embeddings.map((embedding) =>
      queryLoadedStore(store, embedding, topK),
    );
  }

  /**
   * Delete items from the store by their IDs.
   *
   * @param ids - Array of item IDs to delete.
   * @returns Number of items deleted.
   */
  async delete(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;

    const store = await this.load();
    const idSet = new Set(ids);
    const beforeCount = store.items.length;
    store.items = store.items.filter((item) => !idSet.has(item.id));
    const deletedCount = beforeCount - store.items.length;

    if (deletedCount > 0) {
      await this.save(store);
    }

    return deletedCount;
  }

  /**
   * List all items in the store.
   *
   * @returns Array of all items.
   */
  async list(): Promise<VectorStoreItem[]> {
    const store = await this.load();
    return store.items;
  }

  private createEmptyFile(): VectorStoreFile {
    return {
      version: VectorStoreFormatVersion.V1,
      dimension: null,
      items: [],
    };
  }

  private normalizeFile(value: unknown): VectorStoreFile {
    if (!value || typeof value !== "object") return this.createEmptyFile();
    const record = value as Record<string, unknown>;
    const dimension =
      typeof record.dimension === "number" ? record.dimension : null;
    const items = Array.isArray(record.items) ? record.items : [];

    const normalizedItems = items
      .map((entry) => normalizeVectorStoreItem(entry))
      .filter((entry): entry is VectorStoreItem => entry !== null);

    return {
      version: VectorStoreFormatVersion.V1,
      dimension,
      items: normalizedItems,
    };
  }

  private async save(store: VectorStoreFile) {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });

    const tmpPath = `${this.filePath}.tmp`;
    // Use compact JSON (no pretty printing) for better performance with large stores
    // This reduces file size significantly for stores with many items
    const payload = JSON.stringify(store);
    await fs.writeFile(tmpPath, payload, "utf8");
    await fs.rename(tmpPath, this.filePath);
  }
}

/**
 * Normalize unknown input into a VectorStoreItem.
 *
 * @param value - Parsed JSON entry.
 */
function normalizeVectorStoreItem(value: unknown): VectorStoreItem | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id : null;
  const text = typeof record.text === "string" ? record.text : null;
  const embedding = Array.isArray(record.embedding)
    ? (record.embedding as number[])
    : null;

  if (!id || !text || !embedding || embedding.length === 0) return null;

  const createdAt =
    typeof record.createdAt === "number" ? record.createdAt : Date.now();
  const updatedAt =
    typeof record.updatedAt === "number" ? record.updatedAt : createdAt;
  const metadata =
    record.metadata && typeof record.metadata === "object"
      ? (record.metadata as Record<string, unknown>)
      : undefined;
  const embeddingNorm =
    typeof record.embeddingNorm === "number"
      ? record.embeddingNorm
      : vectorNorm(embedding);

  return {
    id,
    text,
    embedding,
    embeddingNorm,
    metadata,
    createdAt,
    updatedAt,
  };
}

function isMissingFileError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "ENOENT"
  );
}

/**
 * Query a loaded store file by embedding.
 *
 * @param store - Loaded store file.
 * @param embedding - Query embedding vector.
 * @param topK - Number of results to return.
 */
function queryLoadedStore(
  store: VectorStoreFile,
  embedding: number[],
  topK: number,
): VectorStoreQueryResult[] {
  if (store.items.length === 0) return [];

  if (!Array.isArray(embedding) || embedding.length === 0) {
    throw new Error(
      "Vector store query requires a non-empty embedding vector.",
    );
  }
  if (store.dimension !== null && store.dimension !== embedding.length) {
    throw new Error(
      `Embedding dimension mismatch (store=${store.dimension}, query=${embedding.length}).`,
    );
  }

  const boundedTopK = Number.isFinite(topK)
    ? Math.max(1, Math.min(50, topK))
    : 5;
  const scored = store.items.map((item) => ({
    item,
    score: cosineSimilarity(item.embedding, embedding),
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, boundedTopK).map(({ item, score }) => ({
    id: item.id,
    text: item.text,
    metadata: item.metadata,
    score,
  }));
}
