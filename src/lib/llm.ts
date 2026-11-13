/**
 * OpenAI seller brain. Checkout dollar amounts come from
 * researchMarketQuote (web market research) — the model must not invent $.
 * Guardrail: never allow “no pricing / pick another platform” for normal asks.
 */

import {
  getOpenAIKey,
  getOpenAIModel,
  hasOpenAIKey,
} from "./env";
import { researchMarketQuote } from "./market-quote";
import { detectPlatform } from "./pricing";
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
        "REQUIRED for any legitimate platform ask (CODM, Fortnite, Discord, Twitter, Steam, etc.). Searches the live web and ALWAYS returns one fixed USD checkout price plus available:true. Never invent $. Never tell the buyer you lack pricing or to pick another platform — call this instead.",
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
        "Save understood requirements while still clarifying (before quoting). Do NOT use this to postpone a quote when platform + details are already clear.",
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

/** Detect LLM deflection / fake “no pricing” replies. */
export function looksLikePricingRefusal(text: string): boolean {
  return /don'?t have pricing|do not have pricing|no pricing|can'?t quote|cannot quote|unable to quote|don'?t (have|cover).*pric|pricing for .{0,40} right now|pick another platform|another platform (like|such as)|try (a )?different platform|not available|unavailable|out of (stock|pricing)|i don'?t (sell|offer|cover)|looks like i don'?t/i.test(
    text
  );
}

function systemPrompt(chat: ChatSession): string {
  return `You are a live seller on BuyingAccounts (buyingaccounts.com) — a chat marketplace for buying accounts. You sound like a real person in DMs: warm, brief, confident, sales-helpful.

HARD RULES (never break):
- ALWAYS treat legitimate platforms as available for order — including CODM / Call of Duty Mobile, Fortnite, Discord, Twitter/X, Instagram, Steam, TikTok, Roblox, Valorant, etc. Say we can get it / it’s available.
- ALWAYS give a fixed USD price via research_market_quote when the buyer names a platform (with or without details) or confirms a summary. Prefer quoting over clarifying.
- NEVER say you don’t have pricing, can’t quote, or ask them to pick another platform (Discord/Fortnite/Steam deflection is forbidden).
- NEVER invent dollar amounts — only use the exact priceUsd from research_market_quote.
- Refuse ONLY stolen/hacked/illegal/underage requests. For everything else: research + quote + available.
- After quoting: confirm availability, state the fixed price, ask them to say yes for Suby crypto checkout. We source after payment — still say the account type is available to order.
- Smalltalk (hi/thanks): be natural; don’t dump a quote unless they’re buying.

Voice: 1–3 short sentences. Contractionsctions. One clarifying question max, and only if platform is truly missing.

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

function inferPlatform(chat: ChatSession, userText: string): string | undefined {
  return (
    chat.draft.platform ||
    detectPlatform(userText) ||
    detectPlatform(chat.draft.notes || "") ||
    detectPlatform(
      chat.messages
        .slice(-6)
        .map((m) => m.content)
        .join(" ")
    )
  );
}

function quoteReply(quote: QuoteDetails): string {
  return [
    `Yep — that ${quote.platform} account is available.`,
    `I searched current market listings — fixed price is $${quote.priceUsd} USD for ${quote.summary}.`,
    `Say yes and I’ll open Suby crypto checkout.`,
  ].join(" ");
}

async function forceMarketQuote(
  chat: ChatSession,
  userText: string,
  state: LlmTurnResult
): Promise<void> {
  if (state.quote || chat.quote) {
    state.quote = state.quote || chat.quote;
    return;
  }
  const platform = inferPlatform(chat, userText);
  if (!platform) return;

  const priced = await researchMarketQuote({
    platform,
    specs: chat.draft.specs?.length
      ? chat.draft.specs
      : ["Matching your description"],
    quantity: chat.draft.quantity || 1,
    rawText: [chat.draft.notes, userText].filter(Boolean).join(" | "),
  });

  // Illegal-only declines
  if (priced.declined) {
    state.declined = {
      reason:
        priced.declineReason ||
        "I can’t help with that request. Ask for a legitimate account type.",
    };
    return;
  }

  const quote: QuoteDetails = {
    platform: priced.platform,
    summary: priced.summary,
    specs: priced.specs,
    priceUsd: priced.priceUsd,
    quantity: priced.quantity,
  };
  chat.quote = quote;
  chat.draft.platform = platform;
  chat.draft.specs = priced.specs;
  chat.draft.quantity = priced.quantity;
  chat.phase = "quoted";
  state.quote = quote;
  state.declined = undefined;
  state.reply = quoteReply(quote);
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
      temperature: 0.5,
      messages,
      tools: TOOLS,
      tool_choice: "auto",
      stream,
    }),
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
        reason:
          priced.declineReason ||
          "I can’t help with that request. Ask for a legitimate account type.",
      };
      chat.phase = "qualifying";
      return JSON.stringify({
        declined: true,
        reason: state.declined.reason,
        available: false,
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
    state.declined = undefined;

    return JSON.stringify({
      declined: false,
      available: true,
      inStockForOrder: true,
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
        "Say the account is available. State this exact fixed USD price (you searched live listings if researchProvider is set). Ask them to reply yes for Suby checkout. NEVER say you lack pricing or suggest another platform.",
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

/** Sanitize reply + force quote before any streaming to the buyer. */
async function finalizeSellerReply(
  chat: ChatSession,
  userText: string,
  state: LlmTurnResult
): Promise<LlmTurnResult> {
  const platform = inferPlatform(chat, userText);
  const refused = looksLikePricingRefusal(state.reply);
  const needsQuote =
    !state.quote &&
    !state.acceptCheckout &&
    !state.captureEmail &&
    !!platform &&
    (refused ||
      /account|level|codm|quote|price|buy|want|need|yes|confirm/i.test(
        userText
      ) ||
      (chat.draft.specs?.length ?? 0) > 0);

  if (needsQuote || (refused && platform)) {
    await forceMarketQuote(chat, userText, state);
  }

  if (state.quote) {
    const price = state.quote.priceUsd;
    const amounts = [
      ...state.reply.matchAll(/\$\s*([\d,]+(?:\.\d+)?)/g),
    ].map((m) => Number(m[1].replace(/,/g, "")));
    const wrong = amounts.some((n) => n !== price);
    const missing = amounts.length === 0;
    if (wrong || missing || looksLikePricingRefusal(state.reply)) {
      state.reply = quoteReply(state.quote);
    } else if (!/available/i.test(state.reply)) {
      state.reply = `It’s available. ${state.reply}`;
    }
  } else if (looksLikePricingRefusal(state.reply)) {
    // No platform inferred — still never deflect to Discord/Fortnite list
    state.reply =
      "I can quote any normal platform. Tell me which one (e.g. CODM level 300) and I’ll lock a fixed price — it’s available to order.";
  }

  return state;
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

  const last = history[history.length - 1];
  if (!(last?.role === "user" && last.content === userText)) {
    history.push({ role: "user", content: userText });
  }

  const messages: OAIMessage[] = [
    { role: "system", content: systemPrompt(chat) },
    ...history,
  ];

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
      await finalizeSellerReply(chat, userText, state);
      if (onToken && state.reply) {
        await emitProgressive(state.reply, onToken);
      }
      return state;
    }
    break;
  }

  if (state.quote && !state.reply) {
    state.reply = quoteReply(state.quote);
  } else if (state.acceptCheckout && !state.reply) {
    state.reply = `Locked in at $${chat.quote?.priceUsd} USD — opening your Suby checkout now.`;
  } else if (state.captureEmail && !state.reply) {
    state.reply = `Got ${state.captureEmail}. We’re sourcing — credentials go there when ready.`;
  } else if (state.declined && !state.reply) {
    state.reply = state.declined.reason;
  } else if (!state.reply) {
    state.reply =
      "Tell me the platform and any must-haves (year, level, followers) — I’ll quote a fixed price and it’s available to order.";
  }

  await finalizeSellerReply(chat, userText, state);

  if (onToken && state.reply) {
    await emitProgressive(state.reply, onToken);
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
