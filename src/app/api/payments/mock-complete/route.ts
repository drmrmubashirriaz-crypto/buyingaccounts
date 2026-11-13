import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { notifyPaidOrder } from "@/lib/alerts";
import { markChatPaid } from "@/lib/bot";
import {
  allowAnonymousMockComplete,
  mockPaymentsEnabled,
} from "@/lib/mock-payments";
import {
  getChat,
  getOrder,
  getOrderByPaymentId,
  saveChat,
  saveOrder,
} from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Mock checkout confirmation.
 * - Local development + SUBY mock: open (no secret in the browser).
 * - Everywhere else (incl. published): require signed-in viewer + ADMIN_KEY.
 * - Published hosts disable mock unless SUBY_MOCK=true (still requireAdmin).
 * Real Suby always uses /api/payments/webhook with SUBY_WEBHOOK_SECRET.
 */
export async function POST(req: NextRequest) {
  if (!mockPaymentsEnabled()) {
    return NextResponse.json(
      { error: "mock payments disabled" },
      { status: 403, headers: { "Cache-Control": "private, no-store" } }
    );
  }

  if (!allowAnonymousMockComplete()) {
    const admin = await requireAdmin(req);
    if (admin instanceof NextResponse) return admin;
  }

  const body = (await req.json()) as {
    paymentId?: string;
    orderId?: string;
  };

  const paymentId = body.paymentId?.trim();
  if (!paymentId) {
    return NextResponse.json({ error: "paymentId required" }, { status: 400 });
  }

  let order =
    (await getOrderByPaymentId(paymentId)) ||
    (body.orderId ? await getOrder(body.orderId) : null);

  if (!order) {
    return NextResponse.json({ error: "order not found" }, { status: 404 });
  }

  if (order.status === "unpaid" || order.status === "awaiting_payment") {
    order.status = "paid";
    order.paidAt = new Date().toISOString();
    order.updatedAt = order.paidAt;
    if (!order.paymentId) order.paymentId = paymentId;
    await saveOrder(order);
    await notifyPaidOrder(order);

    const chat = await getChat(order.chatId);
    if (chat) {
      await saveChat(markChatPaid(chat));
    }
  }

  return NextResponse.json(
    { ok: true, orderId: order.id, status: order.status },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
