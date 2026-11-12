/**
 * Suby crypto checkout interface.
 * v1 uses a mock when SUBY_API_KEY is empty or SUBY_MOCK=true.
 * Swap createCheckout / verifyWebhook to the real Suby API later.
 *
 * Webhook auth never falls back to a shipped default secret.
 */

import { v4 as uuid } from "uuid";
import { getSubyWebhookSecret } from "@/lib/env";

export interface SubyCheckoutRequest {
  amountUsd: number;
  orderId: string;
  description: string;
  successUrl?: string;
  metadata?: Record<string, string>;
}

export interface SubyCheckout {
  id: string;
  url: string;
  amountUsd: number;
  status: "pending" | "paid" | "expired" | "failed";
  mock: boolean;
  raw?: unknown;
}

export interface SubyWebhookEvent {
  type: "payment.paid" | "payment.failed" | "payment.expired";
  paymentId: string;
  orderId?: string;
  amountUsd?: number;
}

function appUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "http://localhost:3000"
  );
}

export function useMock(): boolean {
  if (process.env.SUBY_MOCK === "true") return true;
  if (!process.env.SUBY_API_KEY?.trim()) return true;
  return process.env.SUBY_MOCK !== "false";
}

/** Create a checkout session. Mock returns a local pay page. */
export async function createCheckout(
  req: SubyCheckoutRequest
): Promise<SubyCheckout> {
  if (useMock()) {
    const id = `mock_suby_${uuid().slice(0, 8)}`;
    return {
      id,
      url: `${appUrl()}/pay/${id}?order=${encodeURIComponent(req.orderId)}`,
      amountUsd: req.amountUsd,
      status: "pending",
      mock: true,
    };
  }

  // Real Suby placeholder — wire fields when API docs are finalized.
  const apiKey = process.env.SUBY_API_KEY!;
  const res = await fetch("https://api.suby.example/v1/checkouts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: req.amountUsd,
      currency: "USD",
      description: req.description,
      metadata: { orderId: req.orderId, ...req.metadata },
      success_url: req.successUrl || `${appUrl()}/?paid=1`,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Suby checkout failed: ${res.status} ${body}`);
  }

  const data = (await res.json()) as {
    id: string;
    url?: string;
    checkout_url?: string;
    status?: string;
  };

  return {
    id: data.id,
    url: data.url || data.checkout_url || "",
    amountUsd: req.amountUsd,
    status: "pending",
    mock: false,
    raw: data,
  };
}

/** Require a configured SUBY_WEBHOOK_SECRET and a matching header. Never accept unsigned posts. */
export function verifyWebhookSecret(headerValue: string | null): boolean {
  const secret = getSubyWebhookSecret();
  if (!secret || !headerValue) return false;
  return headerValue === secret || headerValue === `Bearer ${secret}`;
}

export function parseWebhookPayload(body: unknown): SubyWebhookEvent | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const type = String(b.type || b.event || "");
  const paymentId = String(
    b.paymentId || b.payment_id || b.id || b.checkout_id || ""
  );
  if (!paymentId) return null;

  let normalized: SubyWebhookEvent["type"] = "payment.paid";
  if (/fail/i.test(type)) normalized = "payment.failed";
  else if (/expir/i.test(type)) normalized = "payment.expired";
  else if (/paid|success|completed/i.test(type) || !type) {
    normalized = "payment.paid";
  }

  return {
    type: normalized,
    paymentId,
    orderId: b.orderId || b.order_id ? String(b.orderId || b.order_id) : undefined,
    amountUsd:
      typeof b.amountUsd === "number"
        ? b.amountUsd
        : typeof b.amount === "number"
          ? b.amount
          : undefined,
  };
}
