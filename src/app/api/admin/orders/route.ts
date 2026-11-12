import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/admin-auth";
import { markChatDelivered } from "@/lib/bot";
import { notifyPaidOrder } from "@/lib/alerts";
import {
  getChat,
  getOrder,
  listAlerts,
  listOrders,
  saveChat,
  saveOrder,
} from "@/lib/store";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!isAdminAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const orders = await listOrders();
  const alerts = await listAlerts();
  return NextResponse.json({ orders, alerts });
}

export async function PATCH(req: NextRequest) {
  if (!isAdminAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as {
    orderId?: string;
    status?: "sourcing" | "delivered" | "paid";
    buyerEmail?: string;
    resendAlert?: boolean;
  };

  if (!body.orderId) {
    return NextResponse.json({ error: "orderId required" }, { status: 400 });
  }

  const order = await getOrder(body.orderId);
  if (!order) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  if (body.buyerEmail) order.buyerEmail = body.buyerEmail;
  if (body.status) {
    order.status = body.status;
    order.updatedAt = new Date().toISOString();
    if (body.status === "delivered") {
      order.deliveredAt = order.updatedAt;
      const chat = await getChat(order.chatId);
      if (chat) await saveChat(markChatDelivered(chat));
    }
    if (body.status === "sourcing") {
      const chat = await getChat(order.chatId);
      if (chat && chat.phase === "awaiting_email") {
        chat.phase = "sourcing";
        chat.updatedAt = new Date().toISOString();
        await saveChat(chat);
      }
    }
  }

  await saveOrder(order);

  if (body.resendAlert) {
    await notifyPaidOrder(order);
  }

  return NextResponse.json({ order });
}
