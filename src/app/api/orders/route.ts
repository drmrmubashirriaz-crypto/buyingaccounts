import { NextRequest, NextResponse } from "next/server";
import { getOrder } from "@/lib/store";
import { jsonPrivate, ownsOrder, requireViewer } from "@/lib/viewer-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Buyer order lookup — only the owning signed-in viewer may read it. */
export async function GET(req: NextRequest) {
  const viewer = await requireViewer(req);
  if (viewer instanceof NextResponse) return viewer;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return jsonPrivate(
      { error: "id required — use /api/admin/orders for lists" },
      { status: 400 }
    );
  }

  const order = await getOrder(id);
  if (!ownsOrder(order, viewer.sub)) {
    return NextResponse.json(
      { error: "not found" },
      { status: 404, headers: { "Cache-Control": "private, no-store" } }
    );
  }

  return jsonPrivate({ order });
}
