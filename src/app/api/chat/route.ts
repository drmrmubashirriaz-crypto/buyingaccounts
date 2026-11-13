import { NextRequest, NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import {
  attachPaymentMessage,
  createFreshChat,
  runBotTurn,
} from "@/lib/bot";
import { guardCheckoutCreate } from "@/lib/checkout-guard";
import { guardChatTurn } from "@/lib/chat-guard";
import { getChatModeStatus } from "@/lib/env";
import { allowAnonymousMockComplete } from "@/lib/mock-payments";
import { applyPaidEmailCapture } from "@/lib/order-fulfillment";
import { createCheckout } from "@/lib/suby";
import { getChat, getOrder, saveChat, saveOrder } from "@/lib/store";
import type { Order } from "@/lib/types";
import { jsonPrivate, ownsChat, requireViewer } from "@/lib/viewer-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const viewer = await requireViewer(req);
    if (viewer instanceof NextResponse) return viewer;

    const status = getChatModeStatus();
    const chatId = req.nextUrl.searchParams.get("chatId");
    const extras = {
      engine: status.mode,
      mode: status.mode,
      hasKey: status.hasKey,
      model: status.model,
      allowMockComplete: allowAnonymousMockComplete(),
    };

    if (!chatId) {
      const chat = createFreshChat(viewer.sub);
      await saveChat(chat);
      return jsonPrivate({ chat, ...extras });
    }

    const chat = await getChat(chatId);
    if (!ownsChat(chat, viewer.sub)) {
      // Unknown or someone else's chat — never leak; start a fresh owned session
      const fresh = createFreshChat(viewer.sub);
      await saveChat(fresh);
      return jsonPrivate({ chat: fresh, ...extras });
    }

    return jsonPrivate({ chat, ...extras });
  } catch (err) {
    console.error("[chat GET]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "chat open failed" },
      { status: 500, headers: { "Cache-Control": "private, no-store" } }
    );
  }
}

/** Non-streaming turn (kept for scripts/tests). UI prefers /api/chat/stream. */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { chatId?: string; message?: string };
    const message = body.message?.trim();
    if (!message) {
      return NextResponse.json({ error: "message required" }, { status: 400 });
    }

    const gated = await guardChatTurn(req, message);
    if (!gated.ok) return gated.response;

    const status = getChatModeStatus();
    let chat = body.chatId ? await getChat(body.chatId) : null;
    if (!ownsChat(chat, gated.ownerSub)) {
      chat = createFreshChat(gated.ownerSub);
    }

    const { chat: next, actions, engine, fallbackReason } = await runBotTurn(
      chat,
      message
    );
    next.ownerSub = gated.ownerSub;

    if (actions.createCheckout) {
      const quote = actions.createCheckout;
      const spend = guardCheckoutCreate(gated.ownerSub, quote.priceUsd);
      if (!spend.ok) return spend.response;

      const orderId = uuid();
      const checkout = await createCheckout({
        amountUsd: spend.amountUsd,
        orderId,
        description: quote.summary,
      });

      const order: Order = {
        id: orderId,
        chatId: next.id,
        ownerSub: gated.ownerSub,
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
        const applied = applyPaidEmailCapture(
          order,
          gated.ownerSub,
          actions.captureEmail,
          next
        );
        if (applied) {
          await saveOrder(applied.order);
          Object.assign(next, applied.chat);
        } else {
          // Unpaid or not owned — never move to sourcing
          if (next.phase === "sourcing") next.phase = "awaiting_email";
        }
      }
    }

    await saveChat(next);
    const order =
      next.orderId && (await getOrder(next.orderId))?.ownerSub === gated.ownerSub
        ? await getOrder(next.orderId)
        : null;
    return jsonPrivate({
      chat: next,
      order,
      engine,
      mode: status.mode,
      hasKey: status.hasKey,
      model: status.model,
      fallbackReason: fallbackReason || null,
    });
  } catch (err) {
    console.error("[chat POST]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "chat turn failed" },
      { status: 500, headers: { "Cache-Control": "private, no-store" } }
    );
  }
}
