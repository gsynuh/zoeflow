import { NextResponse } from "next/server";

import { requestOpenRouterEmbeddings } from "@/zoeflow/openrouter/embeddings";
import type { OpenRouterEmbeddingsResponse } from "@/zoeflow/openrouter/embeddingsTypes";
import { createVectorStore } from "@/zoeflow/vectorstore";
import { QueryCache } from "@/zoeflow/vectorstore/cache";

export const runtime = "nodejs";

type VectorStoreQueryRequest = {
  storeId?: string;
  query: string;
  model?: string;
  topK?: number;
};

/**
 * Query a server-side vector store using OpenRouter embeddings.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<VectorStoreQueryRequest>;
    const query = typeof body.query === "string" ? body.query.trim() : "";
    if (!query) {
      return NextResponse.json(
        { error: "Invalid vectorstore query payload (expected { query })." },
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

    const controller = new AbortController();
    request.signal.addEventListener("abort", () => controller.abort());

    const queryCache = new QueryCache();
    let embedding = await queryCache.get(query, model);

    // If not cached, fetch from API
    if (!embedding) {
      const embeddingResponse: OpenRouterEmbeddingsResponse =
        await requestOpenRouterEmbeddings(
          { model, input: query },
          { signal: controller.signal },
        );
      const fetchedEmbedding = embeddingResponse.data?.[0]?.embedding;
      if (!Array.isArray(fetchedEmbedding) || fetchedEmbedding.length === 0) {
        return NextResponse.json(
          { error: "Embedding response did not include an embedding vector." },
          { status: 502 },
        );
      }
      embedding = fetchedEmbedding;
      await queryCache.set(query, embedding, model);
    }

    const store = createVectorStore({ storeId: body.storeId });
    const results = await store.query(
      embedding,
      typeof body.topK === "number" ? body.topK : 5,
    );

    return NextResponse.json({
      storeId: store.storeId,
      topK: results.length,
      results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
