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
 * Record a usage event into the server-side usage ledger.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<RecordUsageRequest>;
    const model = typeof body.model === "string" ? body.model.trim() : "";
    if (!model) {
      return NextResponse.json({ error: "Missing model." }, { status: 400 });
    }

    const cost = typeof body.cost === "number" ? body.cost : NaN;
    if (!Number.isFinite(cost)) {
      return NextResponse.json(
        { error: "Missing/invalid cost (must be number)." },
        { status: 400 },
      );
    }

    const sourceRaw = typeof body.source === "string" ? body.source : "";
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
        typeof body.promptTokens === "number" ? body.promptTokens : 0,
      completionTokens:
        typeof body.completionTokens === "number" ? body.completionTokens : 0,
      totalTokens: typeof body.totalTokens === "number" ? body.totalTokens : 0,
      cost,
      upstreamCost:
        typeof body.upstreamCost === "number" ? body.upstreamCost : undefined,
      meta:
        body.meta && typeof body.meta === "object"
          ? (body.meta as Record<string, unknown>)
          : undefined,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
