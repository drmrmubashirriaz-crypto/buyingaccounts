import { v4 as uuid } from "uuid";
import { appendAlert } from "./store";
import type { Order } from "./types";

function formatPaidAlert(order: Order): string {
  return [
    `BuyingAccounts — order paid`,
    `Order: ${order.id}`,
    `Status: ${order.status}`,
    `Quote: $${order.quote.priceUsd} — ${order.quote.summary}`,
    `Buyer email: ${order.buyerEmail || "(not yet)"}`,
    `Chat: ${order.chatId}`,
    `Summary: ${order.chatSummary}`,
  ].join("\n");
}

async function stubTelegram(text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();
  if (!token || !chatId) {
    console.info("[alert:telegram:stub]", text);
    return false;
  }
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text }),
      }
    );
    return res.ok;
  } catch {
    return false;
  }
}

async function stubEmail(text: string): Promise<boolean> {
  const to = process.env.ALERT_EMAIL_TO?.trim();
  if (!to) {
    console.info("[alert:email:stub]", text);
    return false;
  }
  // v1 stub — log only. Plug SendGrid/Resend later.
  console.info("[alert:email]", {
    to,
    from: process.env.ALERT_EMAIL_FROM || "alerts@buyingaccounts.com",
    subject: "BuyingAccounts paid order",
    text,
  });
  return true;
}

export async function notifyPaidOrder(order: Order): Promise<void> {
  const message = formatPaidAlert(order);
  const tgOk = await stubTelegram(message);
  await appendAlert({
    id: uuid(),
    channel: tgOk ? "telegram" : "console",
    orderId: order.id,
    message,
    createdAt: new Date().toISOString(),
    ok: true,
  });

  const mailOk = await stubEmail(message);
  if (mailOk || process.env.ALERT_EMAIL_TO) {
    await appendAlert({
      id: uuid(),
      channel: mailOk ? "email" : "console",
      orderId: order.id,
      message,
      createdAt: new Date().toISOString(),
      ok: mailOk,
    });
  }
}
