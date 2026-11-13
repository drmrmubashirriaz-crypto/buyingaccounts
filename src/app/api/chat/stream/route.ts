import { NextRequest } from "next/server";
import { v4 as uuid } from "uuid";
import {
  attachPaymentMessage,
  createFreshChat,
  runBotTurn,
} from "@/lib/bot";
import { guardCheckoutCreate } from "@/lib/checkout-guard";
import { guardChatTurnSse } from "@/lib/chat-guard";
import { getChatModeStatus } from "@/lib/env";
import { allowAnonymousMockComplete } from "@/lib/mock-payments";
import { applyPaidEmailCapture } from "@/lib/order-fulfillment";
import { createCheckout } from "@/lib/suby";
import { getChat, getOrder, saveChat, saveOrder } from "@/lib/store";
import type { Order } from "@/lib/types";
import { ownsChat } from "@/lib/viewer-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * SSE chat turn — progressive tokens + final chat/order.
 * Events: meta, token, done, error
 */
export async function POST(req: NextRequest) {
  const body = (await req.json()) as { chatId?: string; message?: string };
  const message = body.message?.trim();
  if (!message) {
    return new Response(sse("error", { error: "message required" }), {
      status: 400,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "private, no-store",
      },
    });
  }

  const gated = await guardChatTurnSse(req, message);
  if (!gated.ok) {
    return new Response(sse("error", gated.body), {
      status: gated.status,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "private, no-store",
        ...(gated.retryAfterSec
          ? { "Retry-After": String(gated.retryAfterSec) }
          : {}),
      },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(sse(event, data)));
      };

      try {
        const status = getChatModeStatus();
        let chat = body.chatId ? await getChat(body.chatId) : null;
        if (!ownsChat(chat, gated.ownerSub)) {
          chat = createFreshChat(gated.ownerSub);
        }

        send("meta", {
          chatId: chat.id,
          mode: status.mode,
          hasKey: status.hasKey,
          model: status.model,
          engine: status.mode,
          allowMockComplete: allowAnonymousMockComplete(),
        });

        const { chat: next, actions, engine, fallbackReason } =
          await runBotTurn(chat, message, (token) =>
            send("token", { token })
          );
        next.ownerSub = gated.ownerSub;

        if (fallbackReason) {
          console.info("[chat/stream] llm_error:", fallbackReason);
        }

        if (actions.createCheckout) {
          const quote = actions.createCheckout;
          const spend = guardCheckoutCreate(gated.ownerSub, quote.priceUsd);
          if (!spend.ok) {
            send("error", spend.response.status === 429
              ? { error: "checkout_rate_limited" }
              : { error: "invalid_checkout_amount" });
            return;
          }

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
            } else if (next.phase === "sourcing") {
              next.phase = "awaiting_email";
            }
          }
        }

        await saveChat(next);
        const orderRaw = next.orderId ? await getOrder(next.orderId) : null;
        const order =
          orderRaw && orderRaw.ownerSub === gated.ownerSub ? orderRaw : null;
        send("done", {
          chat: next,
          order,
          engine,
          mode: status.mode,
          hasKey: status.hasKey,
          model: status.model,
          fallbackReason: fallbackReason || null,
        });
      } catch (err) {
        console.error("[chat/stream]", err);
        send("error", {
          error: err instanceof Error ? err.message : "stream failed",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "private, no-store, no-transform",
      Connection: "keep-alive",
    },
  });
}
