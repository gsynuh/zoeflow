import { NextResponse } from "next/server";

import { createVectorStore } from "@/zoeflow/vectorstore";

export const runtime = "nodejs";

type VectorStoreListRequest = {
  storeId?: string;
};

/**
 * List all items in a server-side vector store.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<VectorStoreListRequest>;

    const store = createVectorStore({ storeId: body.storeId });
    const items = await store.list();

    return NextResponse.json({
      storeId: store.storeId,
      count: items.length,
      items,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
