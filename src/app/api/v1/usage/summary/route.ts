import { NextResponse } from "next/server";

import { readUsageLedger } from "@/zoeflow/stats/usageLedger";

export const runtime = "nodejs";

/**
 * Return the current server-side usage ledger summary.
 */
export async function GET() {
  try {
    const ledger = await readUsageLedger();
    return NextResponse.json({ summary: ledger.summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
