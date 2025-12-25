import { promises as fs } from "node:fs";
import path from "node:path";

const DEFAULT_CACHE_DIR = path.join(
  process.cwd(),
  "content",
  "vectorstores",
  "cache",
);

type CacheEntry = {
  embeddedText: string;
  model: string;
  promptVersion: string;
  docId?: string;
  version?: string;
  createdAt: number;
};

type CacheFile = {
  entries: Record<string, CacheEntry>;
};

/**
 * Cache for LLM-generated chunk embedding text (enrichment output).
 * Keeps enrichment deterministic-ish and avoids redundant completion calls.
 */
export class ChunkEnrichmentCache {
  private readonly cacheFilePath: string;
  private cachePromise: Promise<CacheFile> | null = null;
  private cache: CacheFile | null = null;

  constructor(cacheDir?: string) {
    const dir = cacheDir ?? DEFAULT_CACHE_DIR;
    this.cacheFilePath = path.join(dir, "chunkEnrichmentCache.json");
  }

  /**
   * Read a cached enrichment by key.
   *
   * @param key - Cache key (should include model + prompt version + content hash).
   */
  async get(key: string): Promise<string | null> {
    const cache = await this.getCache();
    return cache.entries[key]?.embeddedText ?? null;
  }

  /**
   * Store a cached enrichment by key.
   *
   * @param key - Cache key (should include model + prompt version + content hash).
   * @param entry - Cache entry payload.
   */
  async set(key: string, entry: Omit<CacheEntry, "createdAt">): Promise<void> {
    const cache = await this.getCache();
    cache.entries[key] = {
      ...entry,
      createdAt: Date.now(),
    };
    await this.save(cache);
    this.cache = null;
  }

  /**
   * Delete cached enrichments that match a filter function.
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
      this.cache = null;
    }

    return deletedCount;
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

  private async getCache(): Promise<CacheFile> {
    if (this.cache) return this.cache;
    if (this.cachePromise) return this.cachePromise;

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
    await fs.writeFile(tmpPath, JSON.stringify(cache, null, 2), "utf8");
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
