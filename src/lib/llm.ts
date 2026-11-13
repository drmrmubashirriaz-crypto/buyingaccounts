/**
 * OpenAI seller brain. Checkout dollar amounts come from
 * researchMarketQuote (web market research) — the model must not invent $.
 */

import {
  getOpenAIKey,
  getOpenAIModel,
  hasOpenAIKey,
} from "./env";
import { researchMarketQuote } from "./market-quote";
import type { ChatSession, QuoteDetails } from "./types";

/** @deprecated use hasOpenAIKey from env — kept for call sites */
export function hasOpenAI(): boolean {
  return hasOpenAIKey();
}

export function openAIModel(): string {
  return getOpenAIModel();
}

type OAIMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
};

type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

const TOOLS = [
  {
    type: "function",
    function: {
      name: "research_market_quote",
      description:
        "Search the live web for current account marketplace prices, then return ONE fixed USD checkout price. Call this whenever platform + enough details exist (or the buyer confirms). NEVER invent or guess a dollar amount yourself. NEVER claim you can’t quote a normal platform like CODM, Fortnite, Discord, Twitter, etc. — research and quote instead.",
      parameters: {
        type: "object",
        properties: {
          platform: {
            type: "string",
            description:
              "Platform name, e.g. CODM, Fortnite, Twitter, Discord",
          },
          specs: {
            type: "array",
            items: { type: "string" },
            description:
              "Must-haves: year, level, CP, followers, verified, etc.",
          },
          quantity: {
            type: "number",
            description: "How many accounts (1–20). Default 1.",
          },
          notes: {
            type: "string",
            description: "Buyer’s raw wording for search modifiers",
          },
        },
        required: ["platform"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "accept_quote_and_checkout",
      description:
        "Call when the buyer clearly accepts the current fixed quote (yes, deal, take it, pay, etc.). Triggers Suby crypto checkout creation.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_delivery_email",
      description:
        "Save the buyer’s delivery email after payment is confirmed.",
      parameters: {
        type: "object",
        properties: {
          email: { type: "string" },
        },
        required: ["email"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_draft",
      description:
        "Save understood requirements while still clarifying (before quoting).",
      parameters: {
        type: "object",
        properties: {
          platform: { type: "string" },
          specs: { type: "array", items: { type: "string" } },
          quantity: { type: "number" },
          notes: { type: "string" },
        },
      },
    },
  },
];

function systemPrompt(chat: ChatSession): string {
  return `You are a live seller on BuyingAccounts (buyingaccounts.com) — a chat marketplace for buying accounts. You sound like a real person in DMs: warm, brief, confident, no corporate fluff.

Voice rules:
- 1–3 short sentences usually. Ask at most one clarifying question at a time.
- Mirror the buyer’s vibe. Use contractions. No bullet essays unless quoting.
- Never invent inventory or claim you have a specific account in stock — you source after payment.
- NEVER invent prices, ranges, or “from $X”. Dollar amounts ONLY after research_market_quote returns them — then state that exact fixed USD price.
- Prefer quoting over endless clarifying. If platform + quantity/details are clear (e.g. one level 300 CODM account), or the buyer confirms your summary with yes — immediately call research_market_quote.
- You quote ANY legitimate platform (CODM / Call of Duty Mobile, Fortnite, Discord, Twitter/X, Instagram, Steam, etc.) by researching live market prices. NEVER say “I can’t quote X right now” for a normal platform. NEVER deflect to a different platform unless the buyer asks.
- Refuse only stolen/hacked/illegal asks politely; suggest a legit alternative.
- After quoting: briefly mention you checked current market listings, give the fixed USD price, and ask them to say yes to lock crypto checkout (Suby). No haggling on the fixed quote — they can change requirements to requote.
- After payment: collect delivery email only.
- While awaiting payment / sourcing / delivered: stay helpful and brief.
- Smalltalk (hi/hey/thanks): reply naturally. Do NOT call research_market_quote and do NOT repeat an old quote unless they ask to buy again.

Current phase: ${chat.phase}
Draft so far: ${JSON.stringify(chat.draft)}
${chat.quote ? `Active quote: $${chat.quote.priceUsd} — ${chat.quote.summary}` : "No active quote yet."}
${chat.orderId ? `Order id: ${chat.orderId}` : ""}`;
}

export interface LlmTurnResult {
  reply: string;
  quote?: QuoteDetails;
  declined?: { reason: string };
  acceptCheckout?: boolean;
  captureEmail?: string;
  usedModel: string;
}

function applyDraftUpdate(
  chat: ChatSession,
  args: {
    platform?: string;
    specs?: string[];
    quantity?: number;
    notes?: string;
  }
) {
  if (args.platform) chat.draft.platform = args.platform;
  if (args.specs?.length) {
    chat.draft.specs = [
      ...new Set([...chat.draft.specs, ...args.specs]),
    ];
  }
  if (args.quantity && args.quantity >= 1) {
    chat.draft.quantity = Math.min(20, Math.floor(args.quantity));
  }
  if (args.notes) {
    chat.draft.notes = [chat.draft.notes, args.notes]
      .filter(Boolean)
      .join(" | ");
  }
}

async function chatCompletion(
  messages: OAIMessage[],
  stream: false
): Promise<{
  message: OAIMessage;
  finish_reason?: string;
}>;
async function chatCompletion(
  messages: OAIMessage[],
  stream: true
): Promise<ReadableStream<Uint8Array>>;
async function chatCompletion(
  messages: OAIMessage[],
  stream: boolean
): Promise<
  | { message: OAIMessage; finish_reason?: string }
  | ReadableStream<Uint8Array>
> {
  const key = getOpenAIKey();
  if (!key) {
    throw new Error("OPENAI_API_KEY is empty on the server");
  }
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: getOpenAIModel(),
      temperature: 0.7,
      messages,
      tools: TOOLS,
      tool_choice: "auto",
      stream,
    }),
    // Prevent hung OpenAI calls from freezing the chat Send button forever.
    signal: AbortSignal.timeout(45_000),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI ${res.status}: ${body.slice(0, 400)}`);
  }

  if (stream) {
    if (!res.body) throw new Error("OpenAI stream missing body");
    return res.body;
  }

  const data = (await res.json()) as {
    choices?: {
      message?: OAIMessage;
      finish_reason?: string;
    }[];
  };
  const choice = data.choices?.[0];
  if (!choice?.message) throw new Error("OpenAI empty response");
  return { message: choice.message, finish_reason: choice.finish_reason };
}

async function runTool(
  chat: ChatSession,
  name: string,
  rawArgs: string,
  state: LlmTurnResult
): Promise<string> {
  let args: Record<string, unknown> = {};
  try {
    args = rawArgs ? (JSON.parse(rawArgs) as Record<string, unknown>) : {};
  } catch {
    return JSON.stringify({ error: "invalid JSON args" });
  }

  if (name === "update_draft") {
    applyDraftUpdate(chat, {
      platform: args.platform as string | undefined,
      specs: args.specs as string[] | undefined,
      quantity: args.quantity as number | undefined,
      notes: args.notes as string | undefined,
    });
    chat.phase = "qualifying";
    return JSON.stringify({ ok: true, draft: chat.draft });
  }

  if (name === "research_market_quote" || name === "get_fixed_quote") {
    const platform =
      String(args.platform || chat.draft.platform || "").trim() || "account";
    const specs = Array.isArray(args.specs)
      ? (args.specs as string[])
      : chat.draft.specs;
    const quantity =
      typeof args.quantity === "number"
        ? args.quantity
        : chat.draft.quantity || 1;
    const notes = String(args.notes || chat.draft.notes || "");

    applyDraftUpdate(chat, { platform, specs, quantity, notes });

    const priced = await researchMarketQuote({
      platform,
      specs,
      quantity,
      rawText: notes,
    });

    if (priced.declined) {
      state.declined = {
        reason: priced.declineReason || "Cannot quote that request.",
      };
      chat.phase = "qualifying";
      return JSON.stringify({
        declined: true,
        reason: state.declined.reason,
      });
    }

    const quote: QuoteDetails = {
      platform: priced.platform,
      summary: priced.summary,
      specs: priced.specs,
      priceUsd: priced.priceUsd,
      quantity: priced.quantity,
    };
    chat.quote = quote;
    chat.draft.specs = priced.specs;
    chat.draft.platform = platform;
    chat.draft.quantity = priced.quantity;
    chat.phase = "quoted";
    state.quote = quote;

    return JSON.stringify({
      declined: false,
      priceUsd: quote.priceUsd,
      currency: "USD",
      fixed: true,
      platform: quote.platform,
      summary: quote.summary,
      specs: quote.specs,
      quantity: quote.quantity,
      researchProvider: priced.researchProvider,
      researchBrief: priced.researchBrief,
      instruction:
        "Tell the buyer this exact fixed price (you researched live market listings). Do not change the number. Ask them to reply yes to open crypto checkout. Never say you can’t quote this platform.",
    });
  }

  if (name === "accept_quote_and_checkout") {
    if (!chat.quote) {
      return JSON.stringify({
        ok: false,
        error: "No active quote — call research_market_quote first.",
      });
    }
    state.acceptCheckout = true;
    chat.phase = "awaiting_payment";
    return JSON.stringify({
      ok: true,
      priceUsd: chat.quote.priceUsd,
      message: "Checkout will be created. Tell them you’re opening Suby now.",
    });
  }

  if (name === "save_delivery_email") {
    const email = String(args.email || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return JSON.stringify({ ok: false, error: "Invalid email" });
    }
    state.captureEmail = email;
    chat.phase = "sourcing";
    return JSON.stringify({
      ok: true,
      email,
      status: "sourcing",
      message: "Confirm email saved; operator will source and deliver.",
    });
  }

  return JSON.stringify({ error: `Unknown tool ${name}` });
}

/** Tool-calling turn; returns spoken reply (may stream tokens via onToken). */
export async function runLlmSellerTurn(
  chat: ChatSession,
  userText: string,
  onToken?: (token: string) => void
): Promise<LlmTurnResult> {
  const state: LlmTurnResult = {
    reply: "",
    usedModel: openAIModel(),
  };

  const history: OAIMessage[] = chat.messages
    .filter((m) => m.role === "buyer" || m.role === "bot")
    .slice(-12)
    .map((m) => ({
      role: m.role === "buyer" ? "user" : "assistant",
      content: m.content,
    }));

  // Last history entry may already be the user message just pushed — avoid dup
  const last = history[history.length - 1];
  if (!(last?.role === "user" && last.content === userText)) {
    history.push({ role: "user", content: userText });
  }

  const messages: OAIMessage[] = [
    { role: "system", content: systemPrompt(chat) },
    ...history,
  ];

  // Tool loop (non-streaming)
  for (let i = 0; i < 5; i++) {
    const { message } = await chatCompletion(messages, false);
    messages.push(message);

    const calls = message.tool_calls;
    if (calls?.length) {
      for (const call of calls) {
        const result = await runTool(
          chat,
          call.function.name,
          call.function.arguments || "{}",
          state
        );
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: result,
        });
      }
      continue;
    }

    const content = (message.content || "").trim();
    if (content) {
      state.reply = content;
      if (onToken) {
        await emitProgressive(content, onToken);
      }
      return ensureQuoteMention(state);
    }
    break;
  }

  // Fallback: stream a final spoken line if tools ran but no text
  if (state.quote && !state.reply) {
    state.reply = `I checked current listings — fixed price is $${state.quote.priceUsd} USD for ${state.quote.summary}. Say yes and I’ll open crypto checkout.`;
  } else if (state.acceptCheckout && !state.reply) {
    state.reply = `Locked in at $${chat.quote?.priceUsd} USD — opening your Suby checkout now.`;
  } else if (state.captureEmail && !state.reply) {
    state.reply = `Got ${state.captureEmail}. We’re sourcing — credentials go there when ready.`;
  } else if (state.declined && !state.reply) {
    state.reply = state.declined.reason;
  } else if (!state.reply) {
    state.reply =
      "Tell me the platform and any must-haves (year, level, followers) and I’ll research a fixed price.";
  }

  if (onToken && state.reply) {
    await emitProgressive(state.reply, onToken);
  }
  return ensureQuoteMention(state);
}

function ensureQuoteMention(state: LlmTurnResult): LlmTurnResult {
  if (!state.quote) return state;
  const price = state.quote.priceUsd;
  // If model hallucinated a different $-amount, replace reply with safe copy
  const amounts = [...state.reply.matchAll(/\$\s*([\d,]+(?:\.\d+)?)/g)].map(
    (m) => Number(m[1].replace(/,/g, ""))
  );
  const wrong = amounts.some((n) => n !== price);
  const missing = amounts.length === 0;
  const refused =
    /can'?t quote|cannot quote|don'?t (have|cover).*pric|another platform/i.test(
      state.reply
    );
  if (wrong || missing || refused) {
    state.reply = [
      `I checked current market listings — fixed price is $${price} USD.`,
      `What you get: ${state.quote.summary}.`,
      `Say yes and I’ll open the Suby crypto checkout. Want to tweak anything first?`,
    ].join(" ");
  }
  return state;
}

async function emitProgressive(
  text: string,
  onToken: (t: string) => void
): Promise<void> {
  const parts = text.split(/(\s+)/);
  for (const part of parts) {
    if (!part) continue;
    onToken(part);
    await new Promise((r) => setTimeout(r, 12 + Math.random() * 18));
  }
}

/** Parse OpenAI SSE stream into text tokens (for future direct streaming). */
export async function* readOpenAITokenStream(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (data === "[DONE]") return;
      try {
        const json = JSON.parse(data) as {
          choices?: { delta?: { content?: string } }[];
        };
        const token = json.choices?.[0]?.delta?.content;
        if (token) yield token;
      } catch {
        /* ignore partial */
      }
    }
  }
}
