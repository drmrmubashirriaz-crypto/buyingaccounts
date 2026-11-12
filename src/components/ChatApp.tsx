"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import type { ChatMessage, ChatSession, Order } from "@/lib/types";

function StatusPill({ status }: { status?: string }) {
  if (!status) return null;
  const label = status.replace(/_/g, " ");
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-ink-700/70">
      <span className="h-1.5 w-1.5 rounded-full bg-signal-dim animate-pulse-dot" />
      {label}
    </span>
  );
}

function MessageBubble({
  message,
  onMockPaid,
  streaming,
}: {
  message: ChatMessage;
  onMockPaid?: (orderId: string) => void;
  streaming?: boolean;
}) {
  const mine = message.role === "buyer";
  const isPayment = message.meta?.kind === "payment_link";
  const isQuote = message.meta?.kind === "quote";

  return (
    <div
      className={`flex animate-fade-up ${mine ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`max-w-[min(100%,34rem)] px-4 py-3 text-[15px] leading-relaxed ${
          mine
            ? "rounded-2xl rounded-br-md bg-ink-900 text-mist-50"
            : "rounded-2xl rounded-bl-md bg-white/75 text-ink-900 ring-1 ring-ink-900/8"
        }`}
      >
        {!mine && (
          <div className="mb-1.5 font-display text-[11px] tracking-[0.16em] text-signal-dim uppercase">
            BuyingAccounts
          </div>
        )}
        <div className="whitespace-pre-wrap">
          {message.content}
          {streaming && (
            <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-[2px] animate-pulse bg-signal-dim" />
          )}
        </div>

        {isQuote && message.meta?.priceUsd != null && !streaming && (
          <div className="mt-3 border-t border-ink-900/10 pt-3">
            <div className="font-display text-3xl text-ink-950">
              ${message.meta.priceUsd}
              <span className="ml-1 text-sm font-sans tracking-wide text-ink-700/55">
                USD fixed
              </span>
            </div>
          </div>
        )}

        {isPayment && message.meta?.paymentUrl && !streaming && (
          <div className="mt-3 space-y-2 border-t border-ink-900/10 pt-3">
            <a
              href={message.meta.paymentUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center rounded-xl bg-signal px-4 py-2.5 text-sm font-medium text-ink-950 transition hover:bg-signal-glow"
            >
              Open crypto checkout
            </a>
            {message.meta.orderId && onMockPaid && (
              <button
                type="button"
                onClick={() => onMockPaid(message.meta!.orderId!)}
                className="ml-2 inline-flex items-center rounded-xl px-3 py-2 text-xs text-ink-700/70 ring-1 ring-ink-900/15 transition hover:bg-ink-900/5"
              >
                Mock: mark paid
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ChatApp() {
  const [chat, setChat] = useState<ChatSession | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [booting, setBooting] = useState(true);
  const [engine, setEngine] = useState<"llm" | "rules" | "llm_error" | null>(
    null
  );
  const [hasKey, setHasKey] = useState(false);
  const [streamDraft, setStreamDraft] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function applyMode(data: {
    engine?: unknown;
    mode?: unknown;
    hasKey?: unknown;
  }) {
    if (typeof data.hasKey === "boolean") setHasKey(data.hasKey);
    const eng = data.engine ?? data.mode;
    if (eng === "llm" || eng === "rules" || eng === "llm_error") {
      setEngine(eng);
    }
  }

  useEffect(() => {
    const existing =
      typeof window !== "undefined"
        ? localStorage.getItem("ba_chat_id")
        : null;
    const q = existing ? `?chatId=${existing}` : "";
    Promise.all([
      fetch("/api/chat/status").then((r) => r.json()),
      fetch(`/api/chat${q}`).then((r) => r.json()),
    ])
      .then(async ([status, data]) => {
        applyMode({
          mode: status.mode,
          hasKey: status.hasKey,
          engine: status.mode,
        });
        setChat(data.chat);
        applyMode(data);
        localStorage.setItem("ba_chat_id", data.chat.id);
        if (data.chat.orderId) {
          const o = await fetch(`/api/orders?id=${data.chat.orderId}`).then(
            (r) => r.json()
          );
          if (o.order) setOrder(o.order);
        }
      })
      .finally(() => setBooting(false));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat?.messages.length, sending, streamDraft]);

  async function refreshOrder(orderId: string) {
    const o = await fetch(`/api/orders?id=${orderId}`).then((r) => r.json());
    if (o.order) setOrder(o.order);
  }

  async function send(text: string) {
    if (!text.trim() || sending || !chat) return;
    setSending(true);
    setInput("");
    setStreamDraft("");

    // Optimistic buyer bubble
    const optimistic: ChatSession = {
      ...chat,
      messages: [
        ...chat.messages,
        {
          id: `local-${Date.now()}`,
          role: "buyer",
          content: text.trim(),
          createdAt: new Date().toISOString(),
        },
      ],
    };
    setChat(optimistic);

    let finished = false;
    try {
      const res = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: chat.id, message: text }),
      });

      if (!res.ok || !res.body) {
        throw new Error("Stream failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let draft = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() || "";

        for (const chunk of chunks) {
          const lines = chunk.split("\n");
          let event = "message";
          let dataLine = "";
          for (const line of lines) {
            if (line.startsWith("event:")) event = line.slice(6).trim();
            if (line.startsWith("data:")) dataLine += line.slice(5).trim();
          }
          if (!dataLine) continue;
          const data = JSON.parse(dataLine) as Record<string, unknown>;

          if (event === "meta") {
            applyMode(data);
          } else if (event === "token") {
            draft += String(data.token || "");
            setStreamDraft(draft);
          } else if (event === "done") {
            finished = true;
            const doneChat = data.chat as ChatSession;
            setStreamDraft(null);
            setChat(doneChat);
            localStorage.setItem("ba_chat_id", doneChat.id);
            if (data.order) setOrder(data.order as Order);
            applyMode(data);
          } else if (event === "error") {
            throw new Error(String(data.error || "error"));
          }
        }
      }

      if (!finished) throw new Error("Stream ended early");
    } catch {
      if (!finished) {
        // Fallback non-stream only if the turn never completed
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chatId: chat.id, message: text }),
        });
        const data = await res.json();
        setChat(data.chat);
        localStorage.setItem("ba_chat_id", data.chat.id);
        if (data.order) setOrder(data.order);
        applyMode(data);
      }
      setStreamDraft(null);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await send(input);
  }

  async function mockPaid(orderId: string) {
    const ord = order?.id === orderId ? order : null;
    const paymentId = ord?.paymentId || `mock_manual_${orderId.slice(0, 6)}`;
    await fetch("/api/payments/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-suby-secret": "dev-webhook-secret",
      },
      body: JSON.stringify({
        type: "payment.paid",
        paymentId,
        orderId,
      }),
    });
    const refreshed = await fetch(
      `/api/chat?chatId=${localStorage.getItem("ba_chat_id")}`
    ).then((r) => r.json());
    setChat(refreshed.chat);
    await refreshOrder(orderId);
  }

  async function newChat() {
    localStorage.removeItem("ba_chat_id");
    setOrder(null);
    setStreamDraft(null);
    setBooting(true);
    const [status, data] = await Promise.all([
      fetch("/api/chat/status").then((r) => r.json()),
      fetch("/api/chat").then((r) => r.json()),
    ]);
    setChat(data.chat);
    applyMode({ mode: status.mode, hasKey: status.hasKey, engine: status.mode });
    applyMode(data);
    localStorage.setItem("ba_chat_id", data.chat.id);
    setBooting(false);
  }

  return (
    <div className="relative flex min-h-[100dvh] flex-col">
      <div className="ba-atmosphere absolute inset-0" />
      <div className="ba-noise absolute inset-0" />
      <div className="pointer-events-none absolute -left-24 top-10 h-72 w-72 animate-drift rounded-full bg-signal/25 blur-3xl" />
      <div className="pointer-events-none absolute right-0 top-40 h-80 w-80 animate-drift rounded-full bg-ember/15 blur-3xl [animation-delay:4s]" />

      <header className="relative z-10 mx-auto flex w-full max-w-3xl items-center justify-between px-5 pb-2 pt-6 sm:pt-10">
        <a href="/" className="group">
          <div className="font-display text-2xl tracking-tight text-ink-950 sm:text-3xl">
            BuyingAccounts
          </div>
          <div className="mt-0.5 text-xs tracking-[0.18em] text-ink-700/45 uppercase">
            buyingaccounts.com
          </div>
        </a>
        <div className="flex items-center gap-3">
          {engine && (
            <span
              className={`hidden text-[10px] uppercase tracking-[0.14em] sm:inline ${
                engine === "llm_error"
                  ? "text-ember"
                  : engine === "llm"
                    ? "text-signal-dim"
                    : "text-ink-700/40"
              }`}
              title={
                engine === "llm"
                  ? "OpenAI seller brain (prices from pricing.ts)"
                  : engine === "llm_error"
                    ? "OPENAI_API_KEY is set but the last OpenAI call failed — see chat"
                    : hasKey
                      ? "Key detected but turn used rules — unexpected"
                      : "Enhanced rules (set OPENAI_API_KEY in .env.local for Live LLM)"
              }
            >
              {engine === "llm"
                ? "Live LLM"
                : engine === "llm_error"
                  ? "LLM error"
                  : "Rules"}
            </span>
          )}
          <StatusPill status={order?.status || chat?.phase} />
          <a
            href="/admin"
            className="hidden text-xs text-ink-700/45 transition hover:text-ink-900 sm:inline"
          >
            Operator
          </a>
          <button
            type="button"
            onClick={newChat}
            className="text-xs text-ink-700/45 transition hover:text-ink-900"
          >
            New chat
          </button>
        </div>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-6 sm:px-5">
        <section className="animate-fade-up pb-5 pt-4 sm:pb-8 sm:pt-6">
          <h1 className="max-w-xl font-display text-[1.65rem] leading-[1.15] text-ink-950 sm:text-4xl">
            Name the account.
            <span className="block text-signal-dim">Get a fixed price.</span>
          </h1>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-ink-700/70 sm:text-base">
            Chat marketplace — no catalog. Describe what you need; we quote,
            you pay crypto, we deliver to your email.
          </p>
        </section>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl bg-white/55 shadow-chat ring-1 ring-ink-900/10 backdrop-blur-md">
          <div className="ba-scroll flex-1 space-y-3 overflow-y-auto px-4 py-5 sm:px-6">
            {booting && (
              <div className="text-sm text-ink-700/50">Opening chat…</div>
            )}
            {chat?.messages.map((m) => (
              <MessageBubble
                key={m.id}
                message={m}
                onMockPaid={mockPaid}
              />
            ))}
            {streamDraft !== null && (
              <MessageBubble
                message={{
                  id: "streaming",
                  role: "bot",
                  content: streamDraft || "…",
                  createdAt: new Date().toISOString(),
                }}
                streaming
              />
            )}
            {sending && streamDraft === null && (
              <div className="flex justify-start">
                <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md bg-white/80 px-4 py-3 ring-1 ring-ink-900/8">
                  <span className="typing-dot h-1.5 w-1.5 rounded-full bg-ink-700/50" />
                  <span className="typing-dot h-1.5 w-1.5 rounded-full bg-ink-700/50" />
                  <span className="typing-dot h-1.5 w-1.5 rounded-full bg-ink-700/50" />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <form
            onSubmit={onSubmit}
            className="border-t border-ink-900/8 bg-white/40 p-3 sm:p-4"
          >
            <div className="flex gap-2">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="e.g. Twitter 2009, or Fortnite with 200 CP level 2…"
                className="flex-1 rounded-2xl border-0 bg-white/80 px-4 py-3 text-[15px] text-ink-950 outline-none ring-1 ring-ink-900/10 placeholder:text-ink-700/35 focus:ring-signal/50"
                disabled={booting || sending}
                autoFocus
              />
              <button
                type="submit"
                disabled={booting || sending || !input.trim()}
                className="rounded-2xl bg-signal px-5 py-3 text-sm font-medium text-ink-950 transition hover:bg-signal-glow disabled:cursor-not-allowed disabled:opacity-40"
              >
                Send
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-2 px-1">
              {[
                "Twitter 2009 account",
                "Fortnite 200 CP level 2",
                "Instagram aged with 10k followers",
              ].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="rounded-lg px-2.5 py-1 text-[11px] text-ink-700/55 ring-1 ring-ink-900/10 transition hover:bg-white/70 hover:text-ink-900"
                >
                  {s}
                </button>
              ))}
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
