import { NextResponse } from "next/server";

import { requestOpenRouterEmbeddings } from "@/zoeflow/openrouter/embeddings";
import type { OpenRouterEmbeddingsResponse } from "@/zoeflow/openrouter/embeddingsTypes";
import { buildEmbeddingUsageEvent } from "@/zoeflow/stats/openrouterUsage";
import { UsageEventSource } from "@/zoeflow/stats/types";
import { recordUsageEvent } from "@/zoeflow/stats/usageLedger";
import { createVectorStore } from "@/zoeflow/vectorstore";
import { QueryCache } from "@/zoeflow/vectorstore/cache";
import type { VectorStoreQueryResult } from "@/zoeflow/vectorstore/types";

export const runtime = "nodejs";

type VectorStoreQueryManyRequest = {
  storeId?: string;
  queries: string[];
  model?: string;
  topK?: number;
};

/**
 * Query a server-side vector store using a batch OpenRouter embeddings request.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<VectorStoreQueryManyRequest>;
    const queries = Array.isArray(body.queries)
      ? body.queries
          .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
          .filter((entry) => entry.length > 0)
      : [];

    if (queries.length === 0) {
      return NextResponse.json(
        {
          error:
            "Invalid vectorstore query-many payload (expected { queries: [...] }).",
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

    const topK = typeof body.topK === "number" ? body.topK : 5;

    const controller = new AbortController();
    request.signal.addEventListener("abort", () => controller.abort());

    const queryCache = new QueryCache();
    const cachedEmbeddings = await queryCache.getMany(queries, model);
    const cacheMissIndices: number[] = [];
    const cacheMissQueries: string[] = [];

    cachedEmbeddings.forEach((cached, index) => {
      if (cached === null) {
        cacheMissIndices.push(index);
        cacheMissQueries.push(queries[index]);
      }
    });

    let embeddings: number[][] = [];
    let embeddingUsage: OpenRouterEmbeddingsResponse["usage"] | null = null;

    // If all cached, use cached results
    if (cacheMissQueries.length === 0) {
      embeddings = cachedEmbeddings.filter((e): e is number[] => e !== null);
    } else {
      // Fetch missing embeddings from API
      const embeddingResponse: OpenRouterEmbeddingsResponse =
        await requestOpenRouterEmbeddings(
          {
            model,
            input:
              cacheMissQueries.length === 1
                ? cacheMissQueries[0]
                : cacheMissQueries,
          },
          { signal: controller.signal },
        );
      embeddingUsage = embeddingResponse.usage ?? null;
      const event = embeddingUsage
        ? buildEmbeddingUsageEvent({
            source: UsageEventSource.EmbeddingsProxy,
            model,
            usage: embeddingUsage,
            meta: { route: "/api/v1/vectorstore/query-many" },
          })
        : null;
      if (event) {
        await recordUsageEvent(event);
      }

      const fetchedEmbeddings: number[][] = Array.isArray(
        embeddingResponse.data,
      )
        ? embeddingResponse.data
            .map((entry) => entry.embedding)
            .filter((e): e is number[] => Array.isArray(e))
        : [];

      if (fetchedEmbeddings.length !== cacheMissQueries.length) {
        return NextResponse.json(
          { error: "Embedding response length mismatch for query-many." },
          { status: 502 },
        );
      }

      // Cache the new embeddings
      const itemsToCache = fetchedEmbeddings.map((embedding, idx) => ({
        query: cacheMissQueries[idx],
        embedding,
      }));
      await queryCache.setMany(itemsToCache, model);

      // Merge cached and new embeddings in correct order
      let cacheMissIdx = 0;
      cachedEmbeddings.forEach((cached) => {
        if (cached !== null) {
          embeddings.push(cached);
        } else {
          embeddings.push(fetchedEmbeddings[cacheMissIdx]);
          cacheMissIdx++;
        }
      });
    }

    if (embeddings.length !== queries.length) {
      return NextResponse.json(
        { error: "Embedding response length mismatch for query-many." },
        { status: 502 },
      );
    }

    const store = createVectorStore({ storeId: body.storeId });
    const resultsByQuery = await store.queryMany(embeddings, topK);

    // Apply RRF (Reciprocal Rank Fusion) to combine multiple ranked result lists
    const rrfResults = applyRRF(resultsByQuery);

    return NextResponse.json({
      storeId: store.storeId,
      queries,
      results: rrfResults,
      embedding: {
        model,
        usage: embeddingUsage,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

type RRFResult = VectorStoreQueryResult & {
  similarityScore: number;
};

/**
 * Apply Reciprocal Rank Fusion (RRF) to combine multiple ranked result lists.
 * RRF score = Σ(1 / (k + rank_i)) where k is a constant (typically 60)
 * and rank_i is the 1-indexed rank of the document in query i.
 *
 * Documents appearing in multiple queries get higher RRF scores, naturally
 * promoting results that are relevant across different query perspectives.
 *
 * @param resultsByQuery - Array of ranked result arrays, one per query.
 * @param k - RRF constant (default: 60, standard value). Lower k gives more
 *   weight to top-ranked results; higher k provides more uniform weighting.
 * @returns Unified results sorted by RRF score (descending), with original
 *   similarity scores preserved for filtering.
 */
function applyRRF(
  resultsByQuery: VectorStoreQueryResult[][],
  k: number = 60,
): RRFResult[] {
  // Map: document ID -> { result, rrfScore, originalScore }
  const docMap = new Map<
    string,
    {
      result: VectorStoreQueryResult;
      rrfScore: number;
      originalScore: number;
    }
  >();

  // Process each query's results
  for (let queryIndex = 0; queryIndex < resultsByQuery.length; queryIndex++) {
    const queryResults = resultsByQuery[queryIndex] ?? [];

    // Process each result in this query (already sorted by similarity score)
    for (let rank = 0; rank < queryResults.length; rank++) {
      const result = queryResults[rank];
      const rankPosition = rank + 1; // 1-indexed rank
      const rrfContribution = 1 / (k + rankPosition);

      const existing = docMap.get(result.id);
      if (existing) {
        // Document already seen in another query - add to RRF score
        existing.rrfScore += rrfContribution;
        // Keep the result with the highest original similarity score
        if (result.score > existing.originalScore) {
          existing.result = result;
          existing.originalScore = result.score;
        }
      } else {
        // First time seeing this document
        docMap.set(result.id, {
          result,
          rrfScore: rrfContribution,
          originalScore: result.score,
        });
      }
    }
  }

  // Convert to array and sort by RRF score (descending)
  // Preserve original similarity score for client-side filtering
  const rrfResults = Array.from(docMap.values())
    .map(({ result, rrfScore, originalScore }) => ({
      ...result,
      score: rrfScore, // RRF score for ranking
      similarityScore: originalScore, // Original similarity score for filtering
    }))
    .sort((a, b) => b.score - a.score);

  return rrfResults;
}
