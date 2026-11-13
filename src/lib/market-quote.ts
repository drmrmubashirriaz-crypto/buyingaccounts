/**
 * Research live marketplace signals and spin a fixed checkout quote.
 * Primary path: web search → reasoned USD price.
 * Fallback: soft heuristic (never refuse a normal platform like CODM).
 */

import { getOpenAIKey, getOpenAIModel } from "./env";
import {
  buildAccountPriceQuery,
  extractUsdPrices,
  searchAccountMarket,
  type MarketSearchResult,
} from "./market-search";
import { heuristicMarketQuote, type PricingInput, type PricingResult } from "./pricing";

export interface MarketQuoteResult extends PricingResult {
  researchProvider?: MarketSearchResult["provider"];
  researchQuery?: string;
  marketLow?: number;
  marketHigh?: number;
  researchBrief?: string;
}

const SALES_MARKUP = 1.22; // cover sourcing risk vs median public listing

function median(nums: number[]): number | undefined {
  if (!nums.length) return undefined;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

function roundQuote(n: number): number {
  // Nice checkout numbers
  if (n < 40) return Math.max(15, Math.round(n / 5) * 5);
  if (n < 200) return Math.round(n / 5) * 5;
  return Math.round(n / 10) * 10;
}

async function synthesizeWithOpenAI(input: {
  platform: string;
  specs: string[];
  quantity: number;
  notes?: string;
  evidence: string;
  observed: number[];
}): Promise<{ priceUsd: number; brief: string } | null> {
  const key = getOpenAIKey();
  if (!key) return null;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: getOpenAIModel() || "gpt-4o-mini",
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "You are a pricing analyst for BuyingAccounts, a middleman that sources accounts after crypto payment.",
            "Given marketplace evidence, pick ONE fixed retail USD checkout price that is competitive but covers sourcing risk (~15–30% above typical public listing mid).",
            "Never refuse a legitimate gaming/social platform (CODM, Fortnite, Discord, Twitter, etc.).",
            "Reply JSON only: {\"priceUsd\": number, \"brief\": \"one short sentence on market basis\"}",
          ].join(" "),
        },
        {
          role: "user",
          content: JSON.stringify({
            platform: input.platform,
            specs: input.specs,
            quantity: input.quantity,
            notes: input.notes || "",
            observedUsdPrices: input.observed,
            evidence: input.evidence.slice(0, 6000),
          }),
        },
      ],
    }),
    signal: AbortSignal.timeout(25_000),
  });

  if (!res.ok) {
    console.warn("[market-quote] synthesize failed:", res.status);
    return null;
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const raw = data.choices?.[0]?.message?.content || "";
  try {
    const parsed = JSON.parse(raw) as { priceUsd?: number; brief?: string };
    const price = Number(parsed.priceUsd);
    if (!Number.isFinite(price) || price < 10 || price > 8000) return null;
    return {
      priceUsd: roundQuote(price * Math.max(1, input.quantity || 1)),
      brief: String(parsed.brief || "Based on current public marketplace signals.").slice(
        0,
        240
      ),
    };
  } catch {
    return null;
  }
}

function fromObservedPrices(
  observed: number[],
  quantity: number
): { priceUsd: number; low: number; high: number } | null {
  if (!observed.length) return null;
  const low = observed[0];
  const high = observed[observed.length - 1];
  const mid = median(observed) ?? low;
  const unit = roundQuote(mid * SALES_MARKUP);
  return {
    priceUsd: Math.max(15, unit * Math.max(1, quantity || 1)),
    low,
    high,
  };
}

function labelPlatform(platform: string): string {
  const t = platform.trim();
  if (!t) return "Account";
  if (/^codm$/i.test(t) || /call of duty/i.test(t)) return "CODM";
  return t.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Search the web for market prices and return a fixed checkout quote.
 * Does not refuse normal platforms — always returns a price when request is legit.
 */
export async function researchMarketQuote(
  input: PricingInput
): Promise<MarketQuoteResult> {
  // Illegal / unsafe still decline via shared rules
  const soft = heuristicMarketQuote(input, { forceHeuristic: true });
  if (soft.declined) {
    return soft;
  }

  const platform = (input.platform || "account").trim() || "account";
  const specs =
    input.specs?.length > 0
      ? input.specs
      : ["Matching your description"];
  const qty = Math.min(20, Math.max(1, input.quantity || 1));
  const query = buildAccountPriceQuery({
    platform,
    specs,
    quantity: qty,
    notes: input.rawText,
  });

  let search: MarketSearchResult;
  try {
    search = await searchAccountMarket(query);
  } catch (err) {
    console.warn(
      "[market-quote] search error:",
      err instanceof Error ? err.message : err
    );
    search = { query, provider: "none", hits: [], evidence: "" };
  }

  const observed = extractUsdPrices(search.evidence);
  const synthesized = search.evidence
    ? await synthesizeWithOpenAI({
        platform,
        specs,
        quantity: qty,
        notes: input.rawText,
        evidence: search.evidence,
        observed,
      })
    : null;

  const fromObs = fromObservedPrices(observed, qty);
  const fallback = heuristicMarketQuote(input);

  let priceUsd =
    synthesized?.priceUsd ??
    fromObs?.priceUsd ??
    fallback.priceUsd;
  priceUsd = Math.max(15, roundQuote(priceUsd));

  const label = labelPlatform(platform);
  const searched =
    search.searchedOnline === true || search.provider === "openai_web";
  const brief =
    synthesized?.brief ||
    (fromObs
      ? `Public listings clustered around $${fromObs.low}–$${fromObs.high}; quote includes sourcing buffer.`
      : searched
        ? `Searched the live web for ${label} listings; locked a competitive fixed checkout price.`
        : `Couldn’t reach live search — priced competitively for ${label} with room to source.`);

  const summary = `${qty > 1 ? `${qty}× ` : ""}${label} account — ${specs.join(", ")}`;

  return {
    priceUsd,
    platform: label,
    summary,
    specs,
    quantity: qty,
    researchProvider: search.provider,
    researchQuery: query,
    marketLow: fromObs?.low,
    marketHigh: fromObs?.high,
    researchBrief: searched
      ? `Live web search (${search.provider}): ${brief}`
      : brief,
  };
}
