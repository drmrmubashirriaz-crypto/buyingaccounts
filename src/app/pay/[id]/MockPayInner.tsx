"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useState } from "react";

export default function MockPayInner() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const orderId = search.get("order") || "";
  const [status, setStatus] = useState<"idle" | "paying" | "done" | "error">(
    "idle"
  );
  const [error, setError] = useState("");

  async function pay() {
    setStatus("paying");
    setError("");
    try {
      const res = await fetch("/api/payments/webhook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-suby-secret": "dev-webhook-secret",
        },
        body: JSON.stringify({
          type: "payment.paid",
          paymentId: params.id,
          orderId,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Payment failed");
      }
      setStatus("done");
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <div className="ba-atmosphere relative flex min-h-[100dvh] items-center justify-center px-4">
      <div className="ba-noise absolute inset-0" />
      <div className="relative z-10 w-full max-w-md rounded-3xl bg-white/75 p-8 ring-1 ring-ink-900/10 backdrop-blur-md">
        <div className="font-display text-sm tracking-[0.2em] text-signal-dim uppercase">
          Suby mock checkout
        </div>
        <h1 className="mt-3 font-display text-3xl text-ink-950">
          Pay with crypto
        </h1>
        <p className="mt-2 text-sm text-ink-700/70">
          This is the v1 mock Suby page. Confirming payment fires the same
          webhook route a real Suby integration would hit.
        </p>
        <dl className="mt-6 space-y-2 text-sm text-ink-900">
          <div className="flex justify-between gap-4">
            <dt className="text-ink-700/50">Payment</dt>
            <dd className="font-mono text-xs">{params.id}</dd>
          </div>
          {orderId && (
            <div className="flex justify-between gap-4">
              <dt className="text-ink-700/50">Order</dt>
              <dd className="font-mono text-xs">{orderId}</dd>
            </div>
          )}
        </dl>

        {status === "done" ? (
          <div className="mt-8 rounded-2xl bg-signal/15 p-4 text-sm text-signal-dim ring-1 ring-signal/30">
            Paid. Return to chat — the bot will ask for your delivery email.
            <a href="/" className="mt-3 block font-medium text-ink-950 underline">
              Back to chat
            </a>
          </div>
        ) : (
          <button
            type="button"
            onClick={pay}
            disabled={status === "paying"}
            className="mt-8 w-full rounded-2xl bg-signal py-3.5 text-sm font-semibold text-ink-950 transition hover:bg-signal-glow disabled:opacity-50"
          >
            {status === "paying" ? "Confirming…" : "Simulate crypto payment"}
          </button>
        )}
        {error && <p className="mt-3 text-sm text-ember">{error}</p>}
      </div>
    </div>
  );
}
