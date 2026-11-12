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
import { useMock } from "@/lib/suby";

export const runtime = "nodejs";

/**
 * Mock checkout confirmation only. Available when Suby mock mode is on.
 * Does not use or expose SUBY_WEBHOOK_SECRET — real webhooks stay on /webhook.
 */
export async function POST(req: NextRequest) {
  if (!useMock()) {
    return NextResponse.json({ error: "mock payments disabled" }, { status: 403 });
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
