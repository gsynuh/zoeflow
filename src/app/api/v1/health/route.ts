import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    ok: true,
    service: "zoeflow",
    v: 1,
    now: new Date().toISOString(),
  });
}
