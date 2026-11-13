/**
 * Payment-integrity helpers: email capture / sourcing only after paid.
 */

import type { ChatSession, Order } from "@/lib/types";

/** Order must be paid before capturing delivery email / moving to sourcing. */
export function canCaptureDeliveryEmail(
  order: Order | null | undefined
): boolean {
  return Boolean(order && order.status === "paid");
}

/**
 * Apply delivery email + move to sourcing only when payment is confirmed.
 * Returns null if rejected (unpaid / wrong owner / missing order).
 */
export function applyPaidEmailCapture(
  order: Order,
  ownerSub: string,
  email: string,
  chat: ChatSession
): { order: Order; chat: ChatSession } | null {
  if (order.ownerSub !== ownerSub) return null;
  if (!canCaptureDeliveryEmail(order)) return null;

  const nextOrder: Order = {
    ...order,
    buyerEmail: email,
    status: "sourcing",
    updatedAt: new Date().toISOString(),
  };
  const nextChat: ChatSession = {
    ...chat,
    phase: "sourcing",
    updatedAt: new Date().toISOString(),
  };
  return { order: nextOrder, chat: nextChat };
}
