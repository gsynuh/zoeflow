import { promises as fs } from "node:fs";
import path from "node:path";

import { LocalIndex } from "vectra/lib/LocalIndex";
import type { MetadataTypes, QueryResult } from "vectra/lib/types";

import {
  createVectorStoreItemId,
  normalizeVectorStoreId,
} from "@/zoeflow/vectorstore/ids";
import { vectorNorm } from "@/zoeflow/vectorstore/math";
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

type VectraVectorStoreOptions = {
  storeId?: string;
  rootDir?: string;
};

type VectraItemMetadata = {
  text: string;
  createdAt: number;
  updatedAt: number;
  docId?: string;
  chunkIndex?: number;
  sourceUri?: string;
  version?: string;
  metadataJson?: string;
};

type VectraStoreMeta = Pick<VectorStoreFile, "version" | "dimension">;

function createEmptyMeta(): VectraStoreMeta {
  return {
    version: VectorStoreFormatVersion.V1,
    dimension: null,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeParseMetadataJson(
  raw: unknown,
): Record<string, unknown> | undefined {
  if (typeof raw !== "string" || raw.trim().length === 0) return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return isPlainObject(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Build a ZoeFlow metadata object from Vectra item metadata.
 *
 * Vectra only persists metadata keys that are listed in `metadata_config.indexed`,
 * so we mirror a minimal set of high-value fields as primitives and merge them
 * with any JSON metadata payload when available.
 *
 * @param metadata - Vectra item metadata.
 */
function deriveChunkMetadataFromId(id: string): {
  docId?: string;
  chunkIndex?: number;
} {
  const parts = id.split("_");
  if (parts.length < 3) return {};
  if (parts[0] !== "chunk") return {};

  const docId = parts[1]?.trim();
  const chunkIndexRaw = parts[2]?.trim();
  const chunkIndex = Number(chunkIndexRaw);

  return {
    docId: docId && docId.length > 0 ? docId : undefined,
    chunkIndex: Number.isFinite(chunkIndex) ? chunkIndex : undefined,
  };
}

/**
 * Build a ZoeFlow metadata object for an item.
 *
 * Vectra only persists metadata keys that are listed in `metadata_config.indexed`.
 * Older indexes created before ZoeFlow started persisting metadata will return
 * empty metadata. For document chunks, we can still recover minimal provenance
 * from the chunk id prefix (`chunk_<docId>_<chunkIndex>_...`).
 *
 * @param id - Vector store item id.
 * @param metadata - Vectra item metadata.
 */
function buildVectorStoreMetadataForItem(
  id: string,
  metadata: VectraItemMetadata | undefined,
): Record<string, unknown> {
  const fromJson = safeParseMetadataJson(metadata?.metadataJson);

  const merged: Record<string, unknown> = {
    ...(fromJson ?? {}),
  };

  const derived = deriveChunkMetadataFromId(id);

  if (typeof metadata?.docId === "string" && metadata.docId.trim()) {
    merged.doc_id = metadata.docId;
  } else if (typeof derived.docId === "string" && derived.docId.trim()) {
    merged.doc_id = derived.docId;
  }

  if (
    typeof metadata?.chunkIndex === "number" &&
    Number.isFinite(metadata.chunkIndex)
  ) {
    merged.chunk_index = metadata.chunkIndex;
  } else if (
    typeof derived.chunkIndex === "number" &&
    Number.isFinite(derived.chunkIndex)
  ) {
    merged.chunk_index = derived.chunkIndex;
  }

  if (typeof metadata?.sourceUri === "string" && metadata.sourceUri.trim()) {
    merged.source_uri = metadata.sourceUri;
  }
  if (typeof metadata?.version === "string" && metadata.version.trim()) {
    merged.version = metadata.version;
  }

  return merged;
}

function toMetadataTypes(
  metadata: Record<string, unknown> | undefined,
): Partial<Record<keyof VectraItemMetadata, MetadataTypes>> {
  const metadataJson = metadata ? JSON.stringify(metadata) : undefined;
  return metadataJson ? { metadataJson } : {};
}

function readStringMetadata(
  metadata: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim().length > 0
    ? value
    : undefined;
}

function readNumberMetadata(
  metadata: Record<string, unknown> | undefined,
  key: string,
): number | undefined {
  const value = metadata?.[key];
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

/**
 * Vectra-backed vector store persisted on the server filesystem.
 */
export class VectraVectorStore {
  readonly storeId: string;
  readonly folderPath: string;
  private readonly metaPath: string;
  private readonly index: LocalIndex<VectraItemMetadata>;

  constructor(options?: VectraVectorStoreOptions) {
    const normalized = normalizeVectorStoreId(options?.storeId);
    if (normalized.error || !normalized.value) {
      throw new Error(normalized.error ?? "Invalid storeId.");
    }

    const rootDir = options?.rootDir ?? DEFAULT_VECTORSTORE_DIR;
    this.storeId = normalized.value;
    this.folderPath = path.join(rootDir, `${this.storeId}.vectra`);
    this.metaPath = path.join(this.folderPath, "zoeflow.meta.json");
    this.index = new LocalIndex<VectraItemMetadata>(this.folderPath);
  }

  /**
   * Load the vector store from disk (or initialize a new one).
   */
  async load(): Promise<VectraStoreMeta> {
    await fs.mkdir(this.folderPath, { recursive: true });

    if (!(await this.index.isIndexCreated())) {
      await this.index.createIndex({
        version: 1,
        metadata_config: {
          indexed: [
            "text",
            "createdAt",
            "updatedAt",
            "docId",
            "chunkIndex",
            "sourceUri",
            "version",
            "metadataJson",
          ],
        },
      });
    }

    return await this.readOrCreateMeta();
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
  ): Promise<{ inserted: number; updated: number }> {
    if (items.length === 0) return { inserted: 0, updated: 0 };

    const meta = await this.load();
    const now = Date.now();

    let inserted = 0;
    let updated = 0;
    let dimension = meta.dimension;

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

      if (dimension === null) {
        dimension = input.embedding.length;
      } else if (dimension !== input.embedding.length) {
        throw new Error(
          `Embedding dimension mismatch (store=${dimension}, item=${input.embedding.length}).`,
        );
      }

      const id =
        typeof input.id === "string" && input.id.trim().length > 0
          ? input.id.trim()
          : createVectorStoreItemId();

      const existing = await this.index.getItem(id);
      const createdAt =
        typeof existing?.metadata?.createdAt === "number"
          ? existing.metadata.createdAt
          : now;

      const metadata: VectraItemMetadata = {
        text: input.text,
        createdAt,
        updatedAt: now,
        docId: readStringMetadata(input.metadata, "doc_id"),
        chunkIndex: readNumberMetadata(input.metadata, "chunk_index"),
        sourceUri: readStringMetadata(input.metadata, "source_uri"),
        version: readStringMetadata(input.metadata, "version"),
        ...toMetadataTypes(input.metadata),
      } as VectraItemMetadata;

      await this.index.upsertItem({
        id,
        vector: input.embedding,
        metadata,
      });

      if (existing) updated += 1;
      else inserted += 1;
    }

    if (meta.dimension !== dimension) {
      await this.writeMeta({
        ...meta,
        dimension,
      });
    }

    return { inserted, updated };
  }

  /**
   * Query the store by embedding and return the top matches.
   *
   * @param embedding - Query embedding vector.
   * @param topK - Number of results to return.
   */
  async query(
    embedding: number[],
    topK: number,
  ): Promise<VectorStoreQueryResult[]> {
    await this.load();

    const boundedTopK = Number.isFinite(topK)
      ? Math.max(1, Math.min(50, topK))
      : 5;

    const results = (await this.index.queryItems(
      embedding,
      "",
      boundedTopK,
    )) as Array<QueryResult<VectraItemMetadata>>;

    return results.map((result) => {
      return {
        id: result.item.id,
        text: result.item.metadata?.text ?? "",
        metadata: buildVectorStoreMetadataForItem(
          result.item.id,
          result.item.metadata,
        ),
        score: result.score,
      };
    });
  }

  /**
   * Query the store by multiple embeddings and return the top matches per query.
   *
   * @param embeddings - Query embedding vectors.
   * @param topK - Number of results to return per query.
   */
  async queryMany(
    embeddings: number[][],
    topK: number,
  ): Promise<VectorStoreQueryResult[][]> {
    await this.load();
    return await Promise.all(
      embeddings.map((embedding) => this.query(embedding, topK)),
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
    await this.load();

    let deleted = 0;
    for (const id of ids) {
      const existing = await this.index.getItem(id);
      if (!existing) continue;
      await this.index.deleteItem(id);
      deleted += 1;
    }

    return deleted;
  }

  /**
   * List all items in the store.
   *
   * @returns Array of all items.
   */
  async list(): Promise<VectorStoreItem[]> {
    await this.load();
    const items = await this.index.listItems();
    return items.map((item) => ({
      id: item.id,
      text: item.metadata?.text ?? "",
      embedding: item.vector,
      embeddingNorm: Number.isFinite(item.norm)
        ? item.norm
        : vectorNorm(item.vector),
      metadata: buildVectorStoreMetadataForItem(item.id, item.metadata),
      createdAt:
        typeof item.metadata?.createdAt === "number"
          ? item.metadata.createdAt
          : 0,
      updatedAt:
        typeof item.metadata?.updatedAt === "number"
          ? item.metadata.updatedAt
          : 0,
    }));
  }

  private async readOrCreateMeta(): Promise<VectraStoreMeta> {
    try {
      const raw = await fs.readFile(this.metaPath, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      if (!isPlainObject(parsed))
        return await this.writeMeta(createEmptyMeta());

      const version =
        parsed.version === VectorStoreFormatVersion.V1
          ? VectorStoreFormatVersion.V1
          : VectorStoreFormatVersion.V1;
      const dimension =
        typeof parsed.dimension === "number" &&
        Number.isFinite(parsed.dimension)
          ? parsed.dimension
          : null;

      return { version, dimension };
    } catch {
      return await this.writeMeta(createEmptyMeta());
    }
  }

  private async writeMeta(meta: VectraStoreMeta): Promise<VectraStoreMeta> {
    await fs.writeFile(this.metaPath, JSON.stringify(meta, null, 2), "utf8");
    return meta;
  }
}
