/**
 * Research live marketplace signals and spin a fixed checkout quote.
 * Primary path: web search → reasoned TOTAL USD for the full quantity.
 * Fallback: market-aware heuristic with bulk discounts (never absurd linear bases).
 */

import { getOpenAIKey, getOpenAIModel } from "./env";
import {
  buildAccountPriceQuery,
  extractUsdPrices,
  searchAccountMarket,
  type MarketSearchResult,
} from "./market-search";
import {
  bulkDiscountFactor,
  heuristicMarketQuote,
  heuristicUnitUsd,
  resolvePlatformKey,
  type PricingInput,
  type PricingResult,
} from "./pricing";

export interface MarketQuoteResult extends PricingResult {
  researchProvider?: MarketSearchResult["provider"];
  researchQuery?: string;
  marketLow?: number;
  marketHigh?: number;
  researchBrief?: string;
}

const SALES_MARKUP = 1.18;

function median(nums: number[]): number | undefined {
  if (!nums.length) return undefined;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

function roundQuote(n: number, qty: number): number {
  if (qty >= 10) return Math.max(10, Math.round(n));
  if (n < 40) return Math.max(10, Math.round(n / 5) * 5);
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
  heuristicTotal: number;
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
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "You are a pricing analyst for BuyingAccounts (middleman; sources after crypto pay).",
            "Return ONE fixed TOTAL checkout price in USD for the FULL quantity (not per-unit).",
            "Use marketplace evidence when present. Bulk PVA/email accounts are usually cheap per unit (often well under $5–10 ea in bulk) — do not invent $20–50/ea Gmail PVA.",
            "Stay within ~0.5×–2× of heuristicTotal unless strong evidence says otherwise.",
            "Never refuse. Reply JSON only: {\"priceUsd\": number, \"brief\": \"one short sentence\"}",
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
            heuristicTotalUsd: input.heuristicTotal,
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
    let price = Number(parsed.priceUsd);
    if (!Number.isFinite(price) || price < 5 || price > 8000) return null;
    // Guard against model returning per-unit by mistake on bulk
    if (
      input.quantity >= 5 &&
      price < input.heuristicTotal * 0.15 &&
      price * input.quantity <= 8000
    ) {
      price = price * input.quantity;
    }
    // Clamp runaway vs heuristic when evidence is thin
    if (!input.observed.length) {
      const lo = input.heuristicTotal * 0.5;
      const hi = input.heuristicTotal * 2.2;
      price = Math.min(hi, Math.max(lo, price));
    }
    return {
      priceUsd: roundQuote(price, input.quantity),
      brief: String(
        parsed.brief || "Based on current public marketplace signals."
      ).slice(0, 240),
    };
  } catch {
    return null;
  }
}

function fromObservedPrices(
  observed: number[],
  quantity: number,
  blob: string,
  platform: string
): { priceUsd: number; low: number; high: number } | null {
  if (!observed.length) return null;
  // Prefer lower quartile for bulk commodity accounts (PVA email)
  const sorted = [...observed].sort((a, b) => a - b);
  const low = sorted[0];
  const high = sorted[sorted.length - 1];
  const mid = median(sorted) ?? low;
  const pva = /\bpva\b|phone.?verified/i.test(blob);
  const unitHint = heuristicUnitUsd(platform, blob);
  // Filter absurd outliers (e.g. $200 aged Gmail when buying PVA)
  const filtered = sorted.filter(
    (n) => n <= Math.max(unitHint * 8, mid * 3) && n >= 0.2
  );
  const use = filtered.length ? filtered : sorted;
  const useMid = median(use) ?? mid;
  // If listings look like per-unit prices (common), scale by qty with bulk discount
  const looksPerUnit = useMid <= unitHint * 4 || pva;
  const total = looksPerUnit
    ? useMid * quantity * bulkDiscountFactor(quantity) * SALES_MARKUP
    : useMid * SALES_MARKUP; // already a lot/pack price
  return {
    priceUsd: Math.max(10, roundQuote(total, quantity)),
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
 * Always returns a price for normal account asks.
 */
export async function researchMarketQuote(
  input: PricingInput
): Promise<MarketQuoteResult> {
  const soft = heuristicMarketQuote(input, { forceHeuristic: true });
  if (soft.declined) {
    return soft;
  }

  const platform = (input.platform || "account").trim() || "account";
  const specs =
    input.specs?.length > 0
      ? input.specs
      : ["Matching your description"];
  const qty = Math.min(50, Math.max(1, input.quantity || 1));
  const blob = [platform, ...specs, input.rawText ?? ""].join(" ");
  const query = buildAccountPriceQuery({
    platform,
    specs,
    quantity: qty,
    notes: [input.rawText, qty > 1 ? `bulk ${qty}` : "", /pva/i.test(blob) ? "PVA" : ""]
      .filter(Boolean)
      .join(" "),
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

  const fallback = heuristicMarketQuote({
    ...input,
    quantity: qty,
    platform,
    specs,
  });

  const observed = extractUsdPrices(search.evidence);
  const synthesized = search.evidence
    ? await synthesizeWithOpenAI({
        platform,
        specs,
        quantity: qty,
        notes: input.rawText,
        evidence: search.evidence,
        observed,
        heuristicTotal: fallback.priceUsd,
      })
    : null;

  const fromObs = fromObservedPrices(observed, qty, blob, platform);

  let priceUsd =
    synthesized?.priceUsd ??
    fromObs?.priceUsd ??
    fallback.priceUsd;
  priceUsd = Math.min(8000, Math.max(10, roundQuote(priceUsd, qty)));

  const label = labelPlatform(platform);
  const key = resolvePlatformKey(platform);
  void key;
  const searched =
    search.searchedOnline === true || search.provider === "openai_web";
  const brief =
    synthesized?.brief ||
    (fromObs
      ? `Public listings around $${fromObs.low}–$${fromObs.high}; bulk-aware checkout total.`
      : searched
        ? `Searched live listings for ${label}; fixed competitive total for ${qty}.`
        : `Market search thin — used bulk-aware market estimate for ${qty}× ${label}.`);

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
