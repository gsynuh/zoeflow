import { mkdir, readFile, writeFile } from "fs/promises";
import { NextResponse } from "next/server";
import { join } from "path";

import type { OpenRouterModelsResponse } from "@/zoeflow/openrouter/models";

const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours (UTC-based)

// In-memory cache for performance (fallback to file cache)
let cachedResponse: OpenRouterModelsResponse | null = null;
let cachedAt = 0;

// File-based cache configuration
const CACHE_DIR = join(process.cwd(), ".cache");
const CACHE_FILE = join(CACHE_DIR, "openrouter-models.json");

type CacheFileData = {
  data: OpenRouterModelsResponse;
  cachedAt: number;
};

/**
 * Ensure the cache directory exists.
 */
async function ensureCacheDir(): Promise<void> {
  try {
    await mkdir(CACHE_DIR, { recursive: true });
  } catch (error) {
    // Directory might already exist, ignore error
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code !== "EEXIST"
    ) {
      throw error;
    }
  }
}

/**
 * Read cached data from file if it exists and is still valid.
 * Invalidates cache if older than 24 hours (UTC-based).
 */
async function readFileCache(): Promise<OpenRouterModelsResponse | null> {
  try {
    const fileContent = await readFile(CACHE_FILE, "utf-8");
    const cacheData = JSON.parse(fileContent) as CacheFileData;
    const now = Date.now();
    const ageMs = now - cacheData.cachedAt;

    // Invalidate if cache is older than 24 hours (UTC-based)
    if (ageMs >= CACHE_MAX_AGE_MS) {
      return null;
    }

    // Check if cache is still within TTL
    if (ageMs < CACHE_TTL_MS) {
      // Update in-memory cache
      cachedResponse = cacheData.data;
      cachedAt = cacheData.cachedAt;
      return cacheData.data;
    }
  } catch (error) {
    // File doesn't exist or is invalid, ignore
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code !== "ENOENT"
    ) {
      // Log unexpected errors but don't fail the request
      console.warn("Failed to read cache file:", error);
    }
  }
  return null;
}

/**
 * Write data to cache file.
 * Timestamp is stored as UTC milliseconds since epoch.
 */
async function writeFileCache(data: OpenRouterModelsResponse): Promise<void> {
  try {
    await ensureCacheDir();
    const cacheData: CacheFileData = {
      data,
      cachedAt: Date.now(), // UTC milliseconds since epoch
    };
    await writeFile(CACHE_FILE, JSON.stringify(cacheData, null, 2), "utf-8");
  } catch (error) {
    // Log but don't fail the request if cache write fails
    console.warn("Failed to write cache file:", error);
  }
}

/**
 * Fetch fresh data from OpenRouter.
 */
async function fetchFromOpenRouter(): Promise<OpenRouterModelsResponse> {
  const response = await fetch(OPENROUTER_MODELS_URL, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `OpenRouter models request failed (${response.status}): ${body}`,
    );
  }

  return (await response.json()) as OpenRouterModelsResponse;
}

/**
 * Proxy the public OpenRouter models listing endpoint with file-based caching.
 */
export async function GET() {
  try {
    const now = Date.now();

    // Check in-memory cache first (fastest)
    if (cachedResponse && now - cachedAt < CACHE_TTL_MS) {
      return NextResponse.json(cachedResponse);
    }

    // Check file cache
    const fileCached = await readFileCache();
    if (fileCached) {
      return NextResponse.json(fileCached);
    }

    // Fetch fresh data from OpenRouter
    const data = await fetchFromOpenRouter();

    // Update both caches
    cachedResponse = data;
    cachedAt = now;
    await writeFileCache(data);

    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
