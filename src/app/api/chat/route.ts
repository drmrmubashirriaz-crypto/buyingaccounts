import { NextRequest, NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import {
  attachPaymentMessage,
  createFreshChat,
  runBotTurn,
} from "@/lib/bot";
import { getChatModeStatus } from "@/lib/env";
import { createCheckout } from "@/lib/suby";
import { getChat, getOrder, saveChat, saveOrder } from "@/lib/store";
import type { Order } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const status = getChatModeStatus();
  const chatId = req.nextUrl.searchParams.get("chatId");
  if (!chatId) {
    const chat = createFreshChat();
    await saveChat(chat);
    return NextResponse.json({
      chat,
      engine: status.mode,
      mode: status.mode,
      hasKey: status.hasKey,
      model: status.model,
    });
  }
  const chat = await getChat(chatId);
  if (!chat) {
    const fresh = createFreshChat();
    await saveChat(fresh);
    return NextResponse.json({
      chat: fresh,
      engine: status.mode,
      mode: status.mode,
      hasKey: status.hasKey,
      model: status.model,
    });
  }
  return NextResponse.json({
    chat,
    engine: status.mode,
    mode: status.mode,
    hasKey: status.hasKey,
    model: status.model,
  });
}

/** Non-streaming turn (kept for scripts/tests). UI prefers /api/chat/stream. */
export async function POST(req: NextRequest) {
  const body = (await req.json()) as { chatId?: string; message?: string };
  const message = body.message?.trim();
  if (!message) {
    return NextResponse.json({ error: "message required" }, { status: 400 });
  }

  const status = getChatModeStatus();
  let chat = body.chatId ? await getChat(body.chatId) : null;
  if (!chat) chat = createFreshChat();

  const { chat: next, actions, engine, fallbackReason } = await runBotTurn(
    chat,
    message
  );

  if (actions.createCheckout) {
    const orderId = uuid();
    const quote = actions.createCheckout;
    const checkout = await createCheckout({
      amountUsd: quote.priceUsd,
      orderId,
      description: quote.summary,
    });

    const order: Order = {
      id: orderId,
      chatId: next.id,
      status: "awaiting_payment",
      quote,
      paymentId: checkout.id,
      paymentUrl: checkout.url,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      chatSummary: next.messages
        .filter((m) => m.role === "buyer")
        .slice(-3)
        .map((m) => m.content)
        .join(" · "),
    };
    await saveOrder(order);
    attachPaymentMessage(next, orderId, checkout.url, quote.priceUsd);
    next.orderId = orderId;
  }

  if (actions.captureEmail && next.orderId) {
    const order = await getOrder(next.orderId);
    if (order) {
      order.buyerEmail = actions.captureEmail;
      order.status = "sourcing";
      order.updatedAt = new Date().toISOString();
      await saveOrder(order);
    }
  }

  await saveChat(next);
  const order = next.orderId ? await getOrder(next.orderId) : null;
  return NextResponse.json({
    chat: next,
    order,
    engine,
    mode: status.mode,
    hasKey: status.hasKey,
    model: status.model,
    fallbackReason: fallbackReason || null,
  });
}
