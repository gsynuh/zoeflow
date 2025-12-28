import { NextResponse } from "next/server";

import { clearUsageLedger } from "@/zoeflow/stats/usageLedger";

export const runtime = "nodejs";

/**
 * Clear the server-side usage ledger.
 */
export async function POST() {
  try {
    await clearUsageLedger();
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
