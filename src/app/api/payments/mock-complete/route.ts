import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/admin-auth";
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

/**
 * Mock checkout confirmation.
 * - Local development + SUBY mock: open (no secret in the browser).
 * - Any other environment: requires x-admin-key; never anonymous forge-paid.
 * Real Suby always uses /api/payments/webhook with SUBY_WEBHOOK_SECRET.
 */
export async function POST(req: NextRequest) {
  if (!mockPaymentsEnabled()) {
    return NextResponse.json({ error: "mock payments disabled" }, { status: 403 });
  }

  if (!allowAnonymousMockComplete() && !isAdminAuthorized(req)) {
    return NextResponse.json(
      { error: "unauthorized — mock complete requires ADMIN_KEY outside development" },
      { status: 401 }
    );
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

  return NextResponse.json({ ok: true, orderId: order.id, status: order.status });
}
