import { promises as fs } from "node:fs";
import path from "node:path";

const DEFAULT_CACHE_DIR = path.join(
  process.cwd(),
  "content",
  "vectorstores",
  "cache",
);

type CacheEntry = {
  text: string;
  embedding: number[];
  model: string;
  createdAt: number;
};

type CacheFile = {
  entries: Record<string, CacheEntry>;
};

/**
 * Vector store embedding cache to avoid redundant API calls.
 */
export class VectorStoreCache {
  private readonly cacheFilePath: string;
  private cachePromise: Promise<CacheFile> | null = null;
  private cache: CacheFile | null = null;

  constructor(cacheDir?: string) {
    const dir = cacheDir ?? DEFAULT_CACHE_DIR;
    this.cacheFilePath = path.join(dir, "vectorStoreCache.json");
  }

  /**
   * Get cached embedding for a text string (trimmed).
   *
   * @param text - Text to look up.
   * @param model - Embedding model identifier.
   * @returns Cached embedding if found, null otherwise.
   */
  async get(text: string, model: string): Promise<number[] | null> {
    const cache = await this.getCache();
    const key = this.getCacheKey(text, model);
    const entry = cache.entries[key];
    return entry ? entry.embedding : null;
  }

  /**
   * Store an embedding in the cache.
   *
   * @param text - Text that was embedded.
   * @param embedding - Embedding vector.
   * @param model - Embedding model identifier.
   */
  async set(text: string, embedding: number[], model: string): Promise<void> {
    const cache = await this.getCache();
    const key = this.getCacheKey(text, model);
    cache.entries[key] = {
      text: text.trim(),
      embedding,
      model,
      createdAt: Date.now(),
    };
    await this.save(cache);
  }

  /**
   * Get multiple cached embeddings.
   *
   * @param texts - Array of texts to look up.
   * @param model - Embedding model identifier.
   * @returns Array of embeddings (null for cache misses).
   */
  async getMany(
    texts: string[],
    model: string,
  ): Promise<Array<number[] | null>> {
    const cache = await this.getCache();
    return texts.map((text) => {
      const key = this.getCacheKey(text, model);
      const entry = cache.entries[key];
      return entry ? entry.embedding : null;
    });
  }

  /**
   * Store multiple embeddings in the cache.
   *
   * @param items - Array of { text, embedding } pairs.
   * @param model - Embedding model identifier.
   */
  async setMany(
    items: Array<{ text: string; embedding: number[] }>,
    model: string,
  ): Promise<void> {
    const cache = await this.getCache();
    const now = Date.now();

    for (const item of items) {
      const key = this.getCacheKey(item.text, model);
      cache.entries[key] = {
        text: item.text.trim(),
        embedding: item.embedding,
        model,
        createdAt: now,
      };
    }

    await this.save(cache);
    // Invalidate cached instance so next getCache() reloads from disk
    this.cache = null;
  }

  private getCacheKey(text: string, model: string): string {
    return `${model}:${text.trim()}`;
  }

  private async load(): Promise<CacheFile> {
    try {
      const raw = await fs.readFile(this.cacheFilePath, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      if (
        parsed &&
        typeof parsed === "object" &&
        "entries" in parsed &&
        typeof parsed.entries === "object"
      ) {
        return parsed as CacheFile;
      }
      return { entries: {} };
    } catch (error) {
      if (isMissingFileError(error)) {
        return { entries: {} };
      }
      throw error;
    }
  }

  /**
   * Delete cached embeddings for texts that match a filter function.
   *
   * @param filter - Function that returns true for entries to delete.
   */
  async deleteByFilter(
    filter: (entry: CacheEntry) => boolean,
  ): Promise<number> {
    const cache = await this.getCache();
    let deletedCount = 0;

    for (const key in cache.entries) {
      if (filter(cache.entries[key])) {
        delete cache.entries[key];
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      await this.save(cache);
      // Invalidate cached instance
      this.cache = null;
    }

    return deletedCount;
  }

  /**
   * Get cache (loads once, then reuses in-memory copy).
   */
  private async getCache(): Promise<CacheFile> {
    if (this.cache) {
      return this.cache;
    }

    if (this.cachePromise) {
      return this.cachePromise;
    }

    this.cachePromise = this.load().then((cache) => {
      this.cache = cache;
      this.cachePromise = null;
      return cache;
    });

    return this.cachePromise;
  }

  private async save(cache: CacheFile): Promise<void> {
    await fs.mkdir(path.dirname(this.cacheFilePath), { recursive: true });

    const tmpPath = `${this.cacheFilePath}.tmp`;
    const payload = JSON.stringify(cache, null, 2);
    await fs.writeFile(tmpPath, payload, "utf8");
    await fs.rename(tmpPath, this.cacheFilePath);
  }
}

/**
 * Query embedding cache to avoid redundant API calls for query strings.
 */
export class QueryCache {
  private readonly cacheFilePath: string;

  constructor(cacheDir?: string) {
    const dir = cacheDir ?? DEFAULT_CACHE_DIR;
    this.cacheFilePath = path.join(dir, "queryCache.json");
  }

  /**
   * Get cached embedding for a query string (trimmed).
   *
   * @param query - Query text to look up.
   * @param model - Embedding model identifier.
   * @returns Cached embedding if found, null otherwise.
   */
  async get(query: string, model: string): Promise<number[] | null> {
    const cache = await this.load();
    const key = this.getCacheKey(query, model);
    const entry = cache.entries[key];
    return entry ? entry.embedding : null;
  }

  /**
   * Store a query embedding in the cache.
   *
   * @param query - Query text that was embedded.
   * @param embedding - Embedding vector.
   * @param model - Embedding model identifier.
   */
  async set(query: string, embedding: number[], model: string): Promise<void> {
    const cache = await this.load();
    const key = this.getCacheKey(query, model);
    cache.entries[key] = {
      text: query.trim(),
      embedding,
      model,
      createdAt: Date.now(),
    };
    await this.save(cache);
  }

  /**
   * Get multiple cached query embeddings.
   *
   * @param queries - Array of query texts to look up.
   * @param model - Embedding model identifier.
   * @returns Array of embeddings (null for cache misses).
   */
  async getMany(
    queries: string[],
    model: string,
  ): Promise<Array<number[] | null>> {
    const cache = await this.load();
    return queries.map((query) => {
      const key = this.getCacheKey(query, model);
      const entry = cache.entries[key];
      return entry ? entry.embedding : null;
    });
  }

  /**
   * Store multiple query embeddings in the cache.
   *
   * @param items - Array of { query, embedding } pairs.
   * @param model - Embedding model identifier.
   */
  async setMany(
    items: Array<{ query: string; embedding: number[] }>,
    model: string,
  ): Promise<void> {
    const cache = await this.load();
    const now = Date.now();

    for (const item of items) {
      const key = this.getCacheKey(item.query, model);
      cache.entries[key] = {
        text: item.query.trim(),
        embedding: item.embedding,
        model,
        createdAt: now,
      };
    }

    await this.save(cache);
  }

  private getCacheKey(query: string, model: string): string {
    return `${model}:${query.trim()}`;
  }

  private async load(): Promise<CacheFile> {
    try {
      const raw = await fs.readFile(this.cacheFilePath, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      if (
        parsed &&
        typeof parsed === "object" &&
        "entries" in parsed &&
        typeof parsed.entries === "object"
      ) {
        return parsed as CacheFile;
      }
      return { entries: {} };
    } catch (error) {
      if (isMissingFileError(error)) {
        return { entries: {} };
      }
      throw error;
    }
  }

  private async save(cache: CacheFile): Promise<void> {
    await fs.mkdir(path.dirname(this.cacheFilePath), { recursive: true });

    const tmpPath = `${this.cacheFilePath}.tmp`;
    const payload = JSON.stringify(cache, null, 2);
    await fs.writeFile(tmpPath, payload, "utf8");
    await fs.rename(tmpPath, this.cacheFilePath);
  }
}

function isMissingFileError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "ENOENT"
  );
}
