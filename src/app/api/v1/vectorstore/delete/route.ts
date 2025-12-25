import { NextResponse } from "next/server";

import { createVectorStore } from "@/zoeflow/vectorstore";

export const runtime = "nodejs";

type VectorStoreDeleteRequest = {
  storeId?: string;
  ids: string[];
};

/**
 * Delete items from a server-side vector store.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<VectorStoreDeleteRequest>;
    const ids = Array.isArray(body.ids) ? body.ids : [];

    if (ids.length === 0) {
      return NextResponse.json(
        {
          error:
            "Invalid vectorstore delete payload (expected { ids: [...] }).",
        },
        { status: 400 },
      );
    }

    const normalizedIds = ids
      .map((id) => (typeof id === "string" ? id.trim() : ""))
      .filter((id) => id.length > 0);

    if (normalizedIds.length === 0) {
      return NextResponse.json(
        {
          error: "Vectorstore delete requires at least one valid item ID.",
        },
        { status: 400 },
      );
    }

    const store = createVectorStore({ storeId: body.storeId });
    const deletedCount = await store.delete(normalizedIds);

    return NextResponse.json({
      storeId: store.storeId,
      deleted: deletedCount,
      requested: normalizedIds.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
