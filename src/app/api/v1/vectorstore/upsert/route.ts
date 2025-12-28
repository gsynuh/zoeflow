import { NextResponse } from "next/server";

import { requestOpenRouterEmbeddings } from "@/zoeflow/openrouter/embeddings";
import type { OpenRouterEmbeddingsResponse } from "@/zoeflow/openrouter/embeddingsTypes";
import { buildEmbeddingUsageEvent } from "@/zoeflow/stats/openrouterUsage";
import { UsageEventSource } from "@/zoeflow/stats/types";
import { recordUsageEvent } from "@/zoeflow/stats/usageLedger";
import { createVectorStore, VectorStoreCache } from "@/zoeflow/vectorstore";

export const runtime = "nodejs";

type VectorStoreUpsertItem = {
  id?: string;
  text: string;
  metadata?: Record<string, unknown>;
};

type VectorStoreUpsertRequest = {
  storeId?: string;
  items: VectorStoreUpsertItem[];
  model?: string;
};

/**
 * Insert or replace text entries in a server-side vector store.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<VectorStoreUpsertRequest>;
    const items = Array.isArray(body.items) ? body.items : null;
    if (!items || items.length === 0) {
      return NextResponse.json(
        {
          error:
            "Invalid vectorstore upsert payload (expected { items: [...] }).",
        },
        { status: 400 },
      );
    }

    const normalized = items
      .map((item) => ({
        id: typeof item.id === "string" ? item.id.trim() : undefined,
        text: typeof item.text === "string" ? item.text.trim() : "",
        metadata:
          item.metadata && typeof item.metadata === "object"
            ? (item.metadata as Record<string, unknown>)
            : undefined,
      }))
      .filter((item) => item.text.length > 0);

    if (normalized.length === 0) {
      return NextResponse.json(
        {
          error:
            "Vectorstore upsert requires at least one item with non-empty text.",
        },
        { status: 400 },
      );
    }

    const model =
      typeof body.model === "string" && body.model.trim()
        ? body.model.trim()
        : (process.env.OPENROUTER_EMBEDDING_MODEL ?? "").trim();
    if (!model) {
      return NextResponse.json(
        {
          error:
            "Missing embedding model (provide body.model or set OPENROUTER_EMBEDDING_MODEL).",
        },
        { status: 400 },
      );
    }

    const cache = new VectorStoreCache();
    const texts = normalized.map((item) => item.text);

    // Check cache for all texts
    const cachedEmbeddings = await cache.getMany(texts, model);
    const cacheMissIndices: number[] = [];
    const cacheMissTexts: string[] = [];

    cachedEmbeddings.forEach((cached, index) => {
      if (cached === null) {
        cacheMissIndices.push(index);
        cacheMissTexts.push(texts[index]);
      }
    });

    // Fetch missing embeddings from OpenRouter
    let embeddingData: Array<{ embedding: number[] }> = [];
    if (cacheMissTexts.length > 0) {
      const controller = new AbortController();
      request.signal.addEventListener("abort", () => controller.abort());

      const embeddingResponse: OpenRouterEmbeddingsResponse =
        await requestOpenRouterEmbeddings(
          {
            model,
            input:
              cacheMissTexts.length === 1 ? cacheMissTexts[0] : cacheMissTexts,
          },
          { signal: controller.signal },
        );
      const usage = embeddingResponse.usage ?? null;
      const event = usage
        ? buildEmbeddingUsageEvent({
            source: UsageEventSource.EmbeddingsProxy,
            model,
            usage,
            meta: { route: "/api/v1/vectorstore/upsert" },
          })
        : null;
      if (event) {
        await recordUsageEvent(event);
      }

      const responseData = Array.isArray(embeddingResponse.data)
        ? embeddingResponse.data
        : [];
      if (responseData.length !== cacheMissTexts.length) {
        return NextResponse.json(
          { error: "Embedding response length mismatch for upsert." },
          { status: 502 },
        );
      }

      // Cache the new embeddings
      const itemsToCache = responseData.map((item, idx) => ({
        text: cacheMissTexts[idx],
        embedding: item.embedding,
      }));
      await cache.setMany(itemsToCache, model);

      embeddingData = responseData;
    }

    // Merge cached and new embeddings in correct order
    const allEmbeddings: number[][] = [];
    let cacheMissIdx = 0;

    cachedEmbeddings.forEach((cached) => {
      if (cached !== null) {
        allEmbeddings.push(cached);
      } else {
        const newEmbedding = embeddingData[cacheMissIdx];
        if (newEmbedding) {
          allEmbeddings.push(newEmbedding.embedding);
          cacheMissIdx++;
        }
      }
    });

    if (allEmbeddings.length !== normalized.length) {
      return NextResponse.json(
        { error: "Embedding response length mismatch for upsert." },
        { status: 502 },
      );
    }

    const store = createVectorStore({ storeId: body.storeId });
    const upsertResult = await store.upsert(
      normalized.map((item, index) => ({
        id: item.id,
        text: item.text,
        metadata: item.metadata,
        embedding: allEmbeddings[index] ?? [],
      })),
    );

    return NextResponse.json({
      storeId: store.storeId,
      ...upsertResult,
      count: normalized.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
