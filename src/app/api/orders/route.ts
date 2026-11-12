import { NextRequest, NextResponse } from "next/server";
import { getOrder, listOrders } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (id) {
    const order = await getOrder(id);
    if (!order) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    return NextResponse.json({ order });
  }
  // Public list is admin-only — thin redirect hint
  return NextResponse.json({
    hint: "Use /api/admin/orders with ADMIN_KEY",
    count: (await listOrders()).length,
  });
}
