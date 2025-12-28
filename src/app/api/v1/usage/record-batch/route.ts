import { NextResponse } from "next/server";

import { UsageEventSource } from "@/zoeflow/stats/types";
import { recordUsageEvent } from "@/zoeflow/stats/usageLedger";

export const runtime = "nodejs";

type RecordUsageRequest = {
  source?: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
  upstreamCost?: number;
  meta?: Record<string, unknown>;
};

/**
 * Record a batch of usage events into the server-side usage ledger.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as unknown;
    const events = Array.isArray(body)
      ? (body as Array<Partial<RecordUsageRequest>>)
      : [];

    if (events.length === 0) {
      return NextResponse.json(
        { error: "Expected an array of usage events." },
        { status: 400 },
      );
    }

    for (const entry of events) {
      const model = typeof entry.model === "string" ? entry.model.trim() : "";
      if (!model) continue;

      const cost = typeof entry.cost === "number" ? entry.cost : NaN;
      if (!Number.isFinite(cost)) continue;

      const sourceRaw = typeof entry.source === "string" ? entry.source : "";
      const source =
        sourceRaw === UsageEventSource.NodeExecution ||
        sourceRaw === UsageEventSource.DocumentProcessing ||
        sourceRaw === UsageEventSource.EmbeddingsProxy
          ? (sourceRaw as UsageEventSource)
          : UsageEventSource.NodeExecution;

      await recordUsageEvent({
        at: Date.now(),
        source,
        model,
        promptTokens:
          typeof entry.promptTokens === "number" ? entry.promptTokens : 0,
        completionTokens:
          typeof entry.completionTokens === "number"
            ? entry.completionTokens
            : 0,
        totalTokens:
          typeof entry.totalTokens === "number" ? entry.totalTokens : 0,
        cost,
        upstreamCost:
          typeof entry.upstreamCost === "number"
            ? entry.upstreamCost
            : undefined,
        meta:
          entry.meta && typeof entry.meta === "object"
            ? (entry.meta as Record<string, unknown>)
            : undefined,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
