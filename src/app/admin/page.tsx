"use client";

import { useState } from "react";
import type { AlertLog, Order } from "@/lib/types";

export default function AdminPage() {
  // Kept in React state only for this tab session — never localStorage / query.
  const [key, setKey] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [alerts, setAlerts] = useState<AlertLog[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function load(adminKey = key) {
    if (!adminKey.trim()) {
      setError("Enter ADMIN_KEY to load orders");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/orders", {
        headers: { "x-admin-key": adminKey },
      });
      if (!res.ok) throw new Error("Unauthorized or failed to load");
      const data = await res.json();
      setOrders(data.orders || []);
      setAlerts(data.alerts || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  async function setStatus(orderId: string, status: Order["status"]) {
    const res = await fetch("/api/admin/orders", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-admin-key": key,
      },
      body: JSON.stringify({ orderId, status }),
    });
    if (!res.ok) {
      setError("Update failed");
      return;
    }
    await load();
  }

  return (
    <div className="ba-atmosphere relative min-h-[100dvh] text-ink-900">
      <div className="ba-noise absolute inset-0" />
      <div className="relative z-10 mx-auto max-w-5xl px-5 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <a href="/" className="text-xs text-ink-700/50 hover:text-ink-900">
              ← Chat
            </a>
            <h1 className="mt-2 font-display text-3xl text-ink-950">
              Operator orders
            </h1>
            <p className="mt-1 text-sm text-ink-700/65">
              Manual fulfillment inbox. Mark sourcing → delivered after you
              email credentials. Key is sent only as{" "}
              <code className="text-xs">x-admin-key</code> for this session.
            </p>
          </div>
          <div className="flex gap-2">
            <input
              value={key}
              onChange={(e) => setKey(e.target.value)}
              type="password"
              autoComplete="off"
              className="rounded-xl bg-white/70 px-3 py-2 text-sm ring-1 ring-ink-900/10 outline-none"
              placeholder="ADMIN_KEY"
            />
            <button
              type="button"
              onClick={() => load()}
              className="rounded-xl bg-signal px-4 py-2 text-sm font-medium text-ink-950"
            >
              Refresh
            </button>
          </div>
        </div>

        {error && <p className="mt-4 text-sm text-ember">{error}</p>}
        {loading && <p className="mt-4 text-sm text-ink-700/50">Loading…</p>}

        <div className="mt-8 space-y-4">
          {orders.length === 0 && !loading && (
            <p className="text-sm text-ink-700/50">No orders yet.</p>
          )}
          {orders.map((o) => (
            <article
              key={o.id}
              className="rounded-2xl bg-white/70 p-5 ring-1 ring-ink-900/10"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-mono text-xs text-ink-700/45">
                    {o.id}
                  </div>
                  <h2 className="mt-1 font-display text-xl text-ink-950">
                    ${o.quote.priceUsd} — {o.quote.platform}
                  </h2>
                  <p className="mt-1 text-sm text-ink-700/70">
                    {o.quote.summary}
                  </p>
                </div>
                <span className="rounded-lg bg-signal/15 px-2.5 py-1 text-[11px] uppercase tracking-wider text-signal-dim">
                  {o.status.replace(/_/g, " ")}
                </span>
              </div>
              <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-ink-700/45">Buyer email</dt>
                  <dd>{o.buyerEmail || "—"}</dd>
                </div>
                <div>
                  <dt className="text-ink-700/45">Chat</dt>
                  <dd className="font-mono text-xs">{o.chatId}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-ink-700/45">Buyer summary</dt>
                  <dd className="text-ink-900/90">{o.chatSummary || "—"}</dd>
                </div>
              </dl>
              <div className="mt-4 flex flex-wrap gap-2">
                {o.status === "paid" && (
                  <button
                    type="button"
                    onClick={() => setStatus(o.id, "sourcing")}
                    className="rounded-lg px-3 py-1.5 text-xs ring-1 ring-ink-900/15 hover:bg-white"
                  >
                    Mark sourcing
                  </button>
                )}
                {(o.status === "paid" || o.status === "sourcing") && (
                  <button
                    type="button"
                    onClick={() => setStatus(o.id, "delivered")}
                    className="rounded-lg bg-signal px-3 py-1.5 text-xs font-medium text-ink-950"
                  >
                    Mark delivered
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>

        <section className="mt-12">
          <h2 className="font-display text-xl text-ink-950">Alert log</h2>
          <p className="mt-1 text-sm text-ink-700/55">
            Telegram/email stubs write here (and console) when orders are paid.
          </p>
          <ul className="mt-4 space-y-2">
            {alerts.slice(0, 10).map((a) => (
              <li
                key={a.id}
                className="rounded-xl bg-white/60 px-4 py-3 font-mono text-xs text-ink-700/70 ring-1 ring-ink-900/8"
              >
                <span className="text-signal-dim">{a.channel}</span> · {a.orderId} ·{" "}
                {new Date(a.createdAt).toLocaleString()}
              </li>
            ))}
            {alerts.length === 0 && (
              <li className="text-sm text-ink-700/45">No alerts yet.</li>
            )}
          </ul>
        </section>
      </div>
    </div>
  );
}
