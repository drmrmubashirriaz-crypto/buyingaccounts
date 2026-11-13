import { v4 as uuid } from "uuid";
import { hasOpenAIKey } from "./env";
import { runLlmSellerTurn } from "./llm";
import { researchMarketQuote } from "./market-quote";
import {
  detectPlatform,
  extractQuantity,
} from "./pricing";
import type {
  BotPhase,
  ChatMessage,
  ChatSession,
  QuoteDetails,
} from "./types";

function msg(
  role: ChatMessage["role"],
  content: string,
  meta?: ChatMessage["meta"]
): ChatMessage {
  return {
    id: uuid(),
    role,
    content,
    createdAt: new Date().toISOString(),
    meta,
  };
}

const GREETINGS = [
  "Hey — welcome to BuyingAccounts. What account are you after? Platform + any must-haves is enough for a fixed price, then we settle in crypto.",
  "Hi! You’re in the right place. Tell me what you need (e.g. Twitter 2009, Fortnite with CP/level) and I’ll quote a fixed USD price.",
  "Welcome in. Drop the platform and the details that matter — I’ll give you one fixed price, no catalog hunting.",
];

export function createFreshChat(ownerSub: string): ChatSession {
  const now = new Date().toISOString();
  return {
    id: uuid(),
    ownerSub,
    phase: "greeting",
    draft: { specs: [], quantity: 1 },
    messages: [
      msg("bot", GREETINGS[Math.floor(Math.random() * GREETINGS.length)]),
    ],
    createdAt: now,
    updatedAt: now,
  };
}

function looksLikeAccept(text: string): boolean {
  return /^(yes|y|ok|okay|sure|deal|accept|let'?s go|i'?ll take it|take it|pay|checkout|agreed|sounds good|go ahead|lock it)\b/i.test(
    text.trim()
  );
}

function looksLikeDecline(text: string): boolean {
  return /^(no|n|nope|pass|cancel|nevermind|never mind|too (much|expensive))\b/i.test(
    text.trim()
  );
}

function looksLikeEmail(text: string): string | null {
  const m = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return m ? m[0] : null;
}

/** Greetings / thanks — must not dump a stale quote. */
function isSmalltalk(text: string): boolean {
  const t = text.trim();
  if (t.length > 48) return false;
  return /^(hi|hii+|hello|hey|yo|sup|howdy|thanks|thank you|thx|cool|nice|ok|okay|gm|good (morning|evening|afternoon)|what'?s up|wassup)[\s!.?]*$/i.test(
    t
  );
}

function mergeDraft(chat: ChatSession, text: string): void {
  const platform = detectPlatform(text) ?? chat.draft.platform;
  if (platform) chat.draft.platform = platform;
  const qty = extractQuantity(text);
  if (qty > 1) chat.draft.quantity = qty;
  else if (/account/i.test(text) && !chat.draft.quantity) {
    chat.draft.quantity = 1;
  }
  if (/\bpva\b|phone.?verified/i.test(text)) {
    chat.draft.specs = [...new Set([...chat.draft.specs, "PVA"])];
  }
  if (/\bfresh\b/i.test(text)) {
    chat.draft.specs = [...new Set([...chat.draft.specs, "Fresh"])];
  }

  const extras: string[] = [];
  const year = text.match(/\b(19|20)\d{2}\b/);
  if (year) extras.push(`Created ~${year[0]}`);
  const level = text.match(/level\s*(\d+)/i);
  if (level) extras.push(`Level ${level[1]}`);
  const cp = text.match(/(\d+)\s*cp|cp\s*(\d+)/i);
  if (cp) extras.push(`${cp[1] || cp[2]} CP`);
  const followers = text.match(/(\d[\d,]*)\s*(k)?\s*(followers?|subs?)/i);
  if (followers) {
    extras.push(
      `${followers[1]}${followers[2] ? "k" : ""} ${followers[3].toLowerCase()}`
    );
  }
  if (/verified|blue.?check/i.test(text)) extras.push("Verified");
  if (/aged|og|old/i.test(text)) extras.push("Aged / OG");

  chat.draft.specs = [...new Set([...chat.draft.specs, ...extras])];
  chat.draft.notes = [chat.draft.notes, text].filter(Boolean).join(" | ");
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export type TurnEngine = "llm" | "rules" | "llm_error";

export interface BotTurnResult {
  chat: ChatSession;
  actions: {
    createCheckout?: QuoteDetails;
    captureEmail?: string;
  };
  engine: TurnEngine;
  /** Full bot reply text for streaming UIs */
  streamedReply?: string;
  /** Why we did not use LLM (logged + returned to clients) */
  fallbackReason?: string;
}

export type TokenSink = (token: string) => void;

/**
 * Hybrid: OpenAI when key present.
 * On LLM failure: surface an honest error in chat + engine "llm_error"
 * (never silently pretend Rules succeeded).
 */
export async function runBotTurn(
  chat: ChatSession,
  userText: string,
  onToken?: TokenSink
): Promise<BotTurnResult> {
  const text = userText.trim();
  chat.messages.push(msg("buyer", text));
  chat.updatedAt = new Date().toISOString();

  if (hasOpenAIKey()) {
    try {
      return await runLlmPath(chat, text, onToken);
    } catch (err) {
      const reason =
        err instanceof Error ? err.message : "Unknown OpenAI error";
      console.error("[bot] LLM failed — not falling back to rules:", reason);
      return runLlmErrorPath(chat, reason, onToken);
    }
  }

  return runRulesPath(chat, text, onToken);
}

async function runLlmErrorPath(
  chat: ChatSession,
  reason: string,
  onToken?: TokenSink
): Promise<BotTurnResult> {
  const short =
    reason.length > 180 ? `${reason.slice(0, 177)}…` : reason;
  const content = [
    "I couldn’t reach the live OpenAI seller brain just now.",
    `(${short})`,
    "Check OPENAI_API_KEY in .env.local, restart `npm run dev`, then try again. I won’t fake a Rules quote while your key is set.",
  ].join(" ");

  await emit(content, onToken);
  chat.messages.push(
    msg("bot", content, { kind: "status" })
  );
  chat.updatedAt = new Date().toISOString();
  return {
    chat,
    actions: {},
    engine: "llm_error",
    streamedReply: content,
    fallbackReason: reason,
  };
}

async function runLlmPath(
  chat: ChatSession,
  text: string,
  onToken?: TokenSink
): Promise<BotTurnResult> {
  const actions: BotTurnResult["actions"] = {};

  const result = await runLlmSellerTurn(chat, text, onToken);

  if (result.acceptCheckout && chat.quote) {
    actions.createCheckout = chat.quote;
  }
  if (result.captureEmail) {
    actions.captureEmail = result.captureEmail;
  }

  const meta: ChatMessage["meta"] | undefined = result.quote
    ? { kind: "quote", priceUsd: result.quote.priceUsd }
    : result.captureEmail
      ? { kind: "status" }
      : chat.phase === "awaiting_email"
        ? { kind: "email_prompt" }
        : undefined;

  chat.messages.push(msg("bot", result.reply, meta));
  chat.updatedAt = new Date().toISOString();

  return {
    chat,
    actions,
    engine: "llm",
    streamedReply: result.reply,
  };
}

async function emit(text: string, onToken?: TokenSink): Promise<void> {
  if (!onToken) return;
  const parts = text.split(/(\s+)/);
  for (const part of parts) {
    if (!part) continue;
    onToken(part);
    await new Promise((r) => setTimeout(r, 10 + Math.random() * 16));
  }
}

async function runRulesPath(
  chat: ChatSession,
  text: string,
  onToken?: TokenSink
): Promise<BotTurnResult> {
  const actions: BotTurnResult["actions"] = {};

  const reply = async (
    content: string,
    meta?: ChatMessage["meta"]
  ): Promise<BotTurnResult> => {
    await emit(content, onToken);
    chat.messages.push(msg("bot", content, meta));
    chat.updatedAt = new Date().toISOString();
    return {
      chat,
      actions,
      engine: "rules",
      streamedReply: content,
    };
  };

  if (chat.phase === "delivered") {
    return reply(
      pick([
        "Already marked delivered for this one — if anything’s missing, just say so here and we’ll jump on it.",
        "Credentials should be in your inbox already. Need a resend or something adjusted? Tell me.",
      ]),
      { kind: "status" }
    );
  }

  if (chat.phase === "sourcing") {
    return reply(
      pick([
        "Still sourcing — you’ll get login details at the email on file as soon as it’s ready.",
        "Hang tight, we’re on it. Delivery goes to the email you gave; I’ll update this chat when it’s marked delivered.",
      ]),
      { kind: "status" }
    );
  }

  if (chat.phase === "awaiting_email") {
    const email = looksLikeEmail(text);
    if (!email) {
      return reply(
        pick([
          "Payment’s cleared — what’s the best email for delivery?",
          "Nice. Drop the email where you want the account sent.",
        ]),
        { kind: "email_prompt" }
      );
    }
    actions.captureEmail = email;
    chat.phase = "sourcing";
    return reply(
      `Perfect — I’ve got ${email}. Status is sourcing now; an operator will fulfill manually and mark this delivered when it’s sent.`,
      { kind: "status" }
    );
  }

  if (chat.phase === "awaiting_payment") {
    return reply(
      /paid|done|sent|completed/i.test(text)
        ? "Once Suby confirms (or hit Mock: mark paid if you’re testing), I’ll ask for your delivery email."
        : "Checkout’s still open above — after crypto clears I’ll grab your delivery email."
    );
  }

  // Smalltalk must never dump / re-dump a quote
  if (isSmalltalk(text)) {
    if (chat.phase === "quoted" && chat.quote) {
      return reply(
        `Hey — still here. Your fixed quote is $${chat.quote.priceUsd} for ${chat.quote.summary}. Say yes to checkout, or tell me what to change.`
      );
    }
    chat.phase = chat.phase === "greeting" ? "qualifying" : chat.phase;
    return reply(
      pick([
        "Hey! What account are you looking for?",
        "Hi — tell me the platform and any must-haves and I’ll research a fixed price.",
        "Hello! Drop what you need (platform + details) whenever you’re ready.",
      ])
    );
  }

  if (chat.phase === "quoted" && chat.quote) {
    if (looksLikeDecline(text)) {
      chat.phase = "qualifying";
      chat.quote = undefined;
      return reply(
        "All good. What should we change — platform, year, stats, or quantity? I’ll research a new price."
      );
    }
    if (looksLikeAccept(text)) {
      actions.createCheckout = chat.quote;
      chat.phase = "awaiting_payment";
      return reply(
        `Locked in at $${chat.quote.priceUsd} USD fixed. Generating your Suby crypto checkout…`
      );
    }
    // New details → requote; vague chatter → nudge without re-pasting the same quote block
    const before = JSON.stringify(chat.draft);
    mergeDraft(chat, text);
    const changed = JSON.stringify(chat.draft) !== before;
    if (!changed && !detectPlatform(text) && !/\d{4}|level|cp|follower|verified|account/i.test(text)) {
      return reply(
        `Still $${chat.quote.priceUsd} fixed for ${chat.quote.summary}. Reply yes to pay, or change the specs.`
      );
    }
  } else {
    mergeDraft(chat, text);
  }

  // Always quote when they named anything account-like — never stall on clarifying
  if (!chat.draft.platform) {
    const guessed =
      detectPlatform(text) ||
      detectPlatform(chat.draft.notes || "") ||
      (/account|buy|need|want|looking|quote|price/i.test(text)
        ? "account"
        : undefined);
    if (guessed) {
      chat.draft.platform = guessed;
      if (!chat.draft.quantity) chat.draft.quantity = 1;
    }
  }

  if (
    looksLikeAccept(text) &&
    chat.phase !== "quoted" &&
    chat.draft.platform
  ) {
    // fall through to researchMarketQuote below
  } else if (!chat.draft.platform) {
    chat.phase = "qualifying";
    return reply(
      pick([
        "What account do you need? Name any platform and I’ll quote a fixed price — it’s available.",
        "Tell me the platform (any service or game) and I’ll lock a fixed USD quote right away.",
      ])
    );
  }

  const priced = await researchMarketQuote({
    platform: chat.draft.platform,
    specs: chat.draft.specs,
    quantity: chat.draft.quantity,
    rawText: chat.draft.notes,
  });

  if (priced.declined) {
    chat.phase = "qualifying";
    return reply(
      priced.declineReason ||
        "I can’t help with that request — try a legitimate account type and I’ll research a price."
    );
  }

  const quote: QuoteDetails = {
    platform: priced.platform,
    summary: priced.summary,
    specs: priced.specs,
    priceUsd: priced.priceUsd,
    quantity: priced.quantity,
  };
  chat.quote = quote;
  chat.phase = "quoted";
  chat.draft.specs = priced.specs;

  const searchedLive =
    priced.researchProvider === "openai_web" ||
    priced.researchProvider === "serper" ||
    priced.researchProvider === "brave" ||
    priced.researchProvider === "tavily";
  const researchBit = priced.researchBrief
    ? ` ${priced.researchBrief}`
    : searchedLive
      ? " I searched the live web for current listings."
      : " Used a competitive estimate while search was unavailable.";

  const body = pick([
    searchedLive
      ? `Yep — that ${quote.platform} account is available. I searched online for current prices.${researchBit}\n\nFixed price is $${quote.priceUsd} USD for ${quote.summary}.\n\nSay yes and I’ll open Suby crypto checkout.`
      : `Yep — that ${quote.platform} account is available. Fixed price is $${quote.priceUsd} USD for ${quote.summary}.${researchBit}\n\nSay yes and I’ll open Suby crypto checkout.`,
    `Available — $${quote.priceUsd} USD fixed for ${quote.summary}.${
      searchedLive ? " Based on live web market search." : ""
    }\n\nReply yes to pay, or tell me what to change.`,
  ]);

  return reply(body, { kind: "quote", priceUsd: quote.priceUsd });
}

export function attachPaymentMessage(
  chat: ChatSession,
  orderId: string,
  paymentUrl: string,
  priceUsd: number
): ChatSession {
  chat.messages.push(
    msg(
      "bot",
      `Pay $${priceUsd} USD in crypto here:\n${paymentUrl}\n\nThis chat stays open — after payment confirms I’ll ask for your delivery email.`,
      {
        kind: "payment_link",
        paymentUrl,
        orderId,
        priceUsd,
      }
    )
  );
  chat.orderId = orderId;
  chat.phase = "awaiting_payment";
  chat.updatedAt = new Date().toISOString();
  return chat;
}

export function markChatPaid(chat: ChatSession): ChatSession {
  chat.phase = "awaiting_email";
  chat.messages.push(
    msg("bot", "Payment confirmed. What’s the email for delivery?", {
      kind: "email_prompt",
    })
  );
  chat.updatedAt = new Date().toISOString();
  return chat;
}

export function markChatDelivered(chat: ChatSession): ChatSession {
  chat.phase = "delivered";
  chat.messages.push(
    msg(
      "bot",
      "Marked delivered — credentials were sent to your delivery email. Need anything else on this order? Reply here.",
      { kind: "status" }
    )
  );
  chat.updatedAt = new Date().toISOString();
  return chat;
}

export type { BotPhase };
