import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

import { LocalIndex } from "vectra/lib/LocalIndex";

import { createVectorStore } from "@/zoeflow/vectorstore";
import { normalizeVectorStoreId } from "@/zoeflow/vectorstore/ids";

export const runtime = "nodejs";

const DEFAULT_VECTORSTORE_DIR = path.join(
  process.cwd(),
  "content",
  "vectorstores",
);

/**
 * List all available vector stores.
 */
export async function GET() {
  try {
    await fs.mkdir(DEFAULT_VECTORSTORE_DIR, { recursive: true });
    const entries = await fs.readdir(DEFAULT_VECTORSTORE_DIR, {
      withFileTypes: true,
    });

    const jsonStoreIds = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .filter((entry) => !entry.name.endsWith(".json.backup"))
      .map((entry) => entry.name.replace(/\.json$/, ""));

    const vectraStoreIds = entries
      .filter((entry) => entry.isDirectory() && entry.name.endsWith(".vectra"))
      .map((entry) => entry.name.replace(/\.vectra$/, ""));

    const storesById = new Map<
      string,
      { storeId: string; itemCount: number }
    >();

    const jsonStores = await Promise.all(
      jsonStoreIds.map(async (storeId) => {
        const normalized = normalizeVectorStoreId(storeId);
        if (normalized.error || !normalized.value) return null;

        const filePath = path.join(
          DEFAULT_VECTORSTORE_DIR,
          `${normalized.value}.json`,
        );

        try {
          const raw = await fs.readFile(filePath, "utf8");
          const itemsMatch = raw.match(/"items"\s*:\s*\[/);
          if (!itemsMatch) {
            return { storeId: normalized.value, itemCount: 0 };
          }

          const itemCount = (raw.match(/\{\s*"id"\s*:/g) || []).length;
          return { storeId: normalized.value, itemCount };
        } catch {
          return { storeId: normalized.value, itemCount: 0 };
        }
      }),
    );

    for (const store of jsonStores) {
      if (!store) continue;
      storesById.set(store.storeId, store);
    }

    const vectraStores = await Promise.all(
      vectraStoreIds.map(async (storeId) => {
        const normalized = normalizeVectorStoreId(storeId);
        if (normalized.error || !normalized.value) return null;

        const folderPath = path.join(
          DEFAULT_VECTORSTORE_DIR,
          `${normalized.value}.vectra`,
        );

        try {
          const index = new LocalIndex(folderPath);
          const stats = await index.getIndexStats();
          return { storeId: normalized.value, itemCount: stats.items };
        } catch {
          return { storeId: normalized.value, itemCount: 0 };
        }
      }),
    );

    for (const store of vectraStores) {
      if (!store) continue;
      storesById.set(store.storeId, store);
    }

    // Ensure "default" store exists
    const hasDefault = storesById.has("default");
    if (!hasDefault) {
      const defaultStore = createVectorStore({ storeId: "default" });
      await defaultStore.load();
      storesById.set("default", { storeId: "default", itemCount: 0 });
    }

    return NextResponse.json({
      stores: Array.from(storesById.values()).sort((a, b) =>
        a.storeId.localeCompare(b.storeId),
      ),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Create a new vector store.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { storeId?: string };
    const storeId = typeof body.storeId === "string" ? body.storeId.trim() : "";

    if (!storeId) {
      return NextResponse.json(
        { error: "Missing storeId in request body." },
        { status: 400 },
      );
    }

    const normalized = normalizeVectorStoreId(storeId);
    if (normalized.error || !normalized.value) {
      return NextResponse.json(
        { error: normalized.error ?? "Invalid storeId." },
        { status: 400 },
      );
    }

    const store = createVectorStore({ storeId: normalized.value });
    await store.load();

    return NextResponse.json({
      storeId: normalized.value,
      created: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
