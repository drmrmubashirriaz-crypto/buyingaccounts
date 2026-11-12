import { NextRequest, NextResponse } from "next/server";
import { notifyPaidOrder } from "@/lib/alerts";
import { markChatPaid } from "@/lib/bot";
import {
  getChat,
  getOrder,
  getOrderByPaymentId,
  saveChat,
  saveOrder,
} from "@/lib/store";
import { parseWebhookPayload, verifyWebhookSecret } from "@/lib/suby";

export const runtime = "nodejs";

/**
 * Real Suby webhook endpoint. Always requires SUBY_WEBHOOK_SECRET.
 * Mock checkout uses /api/payments/mock-complete instead (no shared secret in the browser).
 */
export async function POST(req: NextRequest) {
  const secret =
    req.headers.get("x-suby-secret") || req.headers.get("authorization");
  if (!verifyWebhookSecret(secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const event = parseWebhookPayload(body);
  if (!event) {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  if (event.type !== "payment.paid") {
    return NextResponse.json({ ok: true, ignored: event.type });
  }

  let order =
    (await getOrderByPaymentId(event.paymentId)) ||
    (event.orderId ? await getOrder(event.orderId) : null);

  if (!order) {
    return NextResponse.json({ error: "order not found" }, { status: 404 });
  }

  if (order.status === "unpaid" || order.status === "awaiting_payment") {
    order.status = "paid";
    order.paidAt = new Date().toISOString();
    order.updatedAt = order.paidAt;
    if (!order.paymentId) order.paymentId = event.paymentId;
    await saveOrder(order);
    await notifyPaidOrder(order);

    const chat = await getChat(order.chatId);
    if (chat) {
      await saveChat(markChatPaid(chat));
    }
  }

  return NextResponse.json({ ok: true, orderId: order.id, status: order.status });
}
