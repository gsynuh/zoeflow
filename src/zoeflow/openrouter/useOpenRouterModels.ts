"use client";

import { useEffect, useMemo, useState } from "react";

import { OPENROUTER_MODELS_ENDPOINT } from "@/zoeflow/openrouter/endpoints";
import {
  indexOpenRouterModelsById,
  type OpenRouterModel,
  type OpenRouterModelsResponse,
} from "@/zoeflow/openrouter/models";

type CacheEntry = {
  modelsById: Record<string, OpenRouterModel>;
  cachedAt: number;
};

const cacheByEndpoint = new Map<string, CacheEntry>();
const DEFAULT_TTL_MS = 30 * 60 * 1000;

export type UseOpenRouterModelsByIdOptions = {
  endpoint?: string;
  ttlMs?: number;
};

/**
 * Load OpenRouter models (via the app's proxy endpoint) and expose an id-indexed map.
 *
 * Errors are intentionally swallowed so the UI can fall back to "unknown pricing" scenarios.
 *
 * @param options - Hook options, including endpoint override and cache TTL.
 */
export function useOpenRouterModelsById(
  options?: UseOpenRouterModelsByIdOptions,
): Record<string, OpenRouterModel> {
  const endpoint = options?.endpoint ?? OPENROUTER_MODELS_ENDPOINT;
  const ttlMs = options?.ttlMs ?? DEFAULT_TTL_MS;

  const cached = useMemo(
    () => cacheByEndpoint.get(endpoint) ?? null,
    [endpoint],
  );
  const [modelsById, setModelsById] = useState<Record<string, OpenRouterModel>>(
    () => cached?.modelsById ?? {},
  );

  useEffect(() => {
    const current = cacheByEndpoint.get(endpoint) ?? null;
    if (current && Date.now() - current.cachedAt < ttlMs) {
      queueMicrotask(() => setModelsById(current.modelsById));
      return;
    }

    const controller = new AbortController();

    async function loadModels() {
      try {
        const response = await fetch(endpoint, { signal: controller.signal });
        if (!response.ok) return;
        const data = (await response.json()) as OpenRouterModelsResponse;
        if (!data?.data) return;

        const next = indexOpenRouterModelsById({ data: data.data });
        cacheByEndpoint.set(endpoint, {
          modelsById: next,
          cachedAt: Date.now(),
        });
        setModelsById(next);
      } catch {
        // Ignore models loading errors (UI will fallback to unknown pricing).
      }
    }

    void loadModels();

    return () => {
      controller.abort();
    };
  }, [endpoint, ttlMs]);

  return modelsById;
}
