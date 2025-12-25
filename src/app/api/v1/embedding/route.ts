import { NextResponse } from "next/server";

import { requestOpenRouterEmbeddings } from "@/zoeflow/openrouter/embeddings";
import type { OpenRouterEmbeddingsRequest } from "@/zoeflow/openrouter/embeddingsTypes";
import { VectorStoreCache } from "@/zoeflow/vectorstore";

export const runtime = "nodejs";

/**
 * Proxy embeddings requests to OpenRouter, with caching support.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<OpenRouterEmbeddingsRequest>;

    const model =
      typeof body.model === "string" && body.model.trim()
        ? body.model.trim()
        : (process.env.OPENROUTER_EMBEDDING_MODEL ?? "").trim();

    const input = body.input;
    const hasValidInput =
      typeof input === "string"
        ? input.trim().length > 0
        : Array.isArray(input) &&
          input.every((entry) => typeof entry === "string");

    if (!model || !hasValidInput) {
      return NextResponse.json(
        { error: "Invalid embedding payload (expected { model, input })." },
        { status: 400 },
      );
    }

    const cache = new VectorStoreCache();
    const inputs = Array.isArray(input) ? input : [input];
    const trimmedInputs = inputs.map((text) => {
      if (typeof text !== "string") {
        throw new Error("Invalid input: expected string or string array");
      }
      return text.trim();
    });

    // Check cache for all inputs
    const cachedEmbeddings = await cache.getMany(trimmedInputs, model);
    const cacheMissIndices: number[] = [];
    const cacheMissInputs: string[] = [];

    cachedEmbeddings.forEach((cached, index) => {
      if (cached === null) {
        cacheMissIndices.push(index);
        cacheMissInputs.push(trimmedInputs[index]);
      }
    });

    // If all cached, return cached results
    if (cacheMissInputs.length === 0) {
      const data = cachedEmbeddings.map((embedding, index) => ({
        index,
        embedding: embedding!,
        object: "embedding" as const,
      }));

      return NextResponse.json({
        data: Array.isArray(input) ? data : data[0],
        model,
        object: "list" as const,
      });
    }

    // Fetch missing embeddings from OpenRouter
    const controller = new AbortController();
    request.signal.addEventListener("abort", () => controller.abort());

    const response = await requestOpenRouterEmbeddings(
      {
        model,
        input:
          cacheMissInputs.length === 1 ? cacheMissInputs[0] : cacheMissInputs,
      },
      { signal: controller.signal },
    );

    // Cache the new embeddings
    const responseData = Array.isArray(response.data) ? response.data : [];
    const itemsToCache = responseData.map((item, idx) => ({
      text: cacheMissInputs[idx],
      embedding: item.embedding,
    }));
    await cache.setMany(itemsToCache, model);

    // Merge cached and new embeddings in correct order
    const allEmbeddings: Array<{
      index: number;
      embedding: number[];
      object: "embedding";
    }> = [];
    let cacheMissIdx = 0;

    cachedEmbeddings.forEach((cached, index) => {
      if (cached !== null) {
        allEmbeddings.push({
          index,
          embedding: cached,
          object: "embedding" as const,
        });
      } else {
        const newEmbedding = responseData[cacheMissIdx];
        if (newEmbedding) {
          allEmbeddings.push({
            index,
            embedding: newEmbedding.embedding,
            object: "embedding" as const,
          });
          cacheMissIdx++;
        }
      }
    });

    return NextResponse.json({
      data: Array.isArray(input) ? allEmbeddings : allEmbeddings[0],
      model,
      object: "list" as const,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
