import { NextRequest } from "next/server";
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
        "Cache-Control": "no-cache",
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
        if (!chat) chat = createFreshChat();

        // Intended mode from env (badge truth before the turn)
        send("meta", {
          chatId: chat.id,
          mode: status.mode,
          hasKey: status.hasKey,
          model: status.model,
          engine: status.mode,
        });

        const { chat: next, actions, engine, fallbackReason } =
          await runBotTurn(chat, message, (token) =>
            send("token", { token })
          );

        if (fallbackReason) {
          console.info("[chat/stream] llm_error:", fallbackReason);
        }

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
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
