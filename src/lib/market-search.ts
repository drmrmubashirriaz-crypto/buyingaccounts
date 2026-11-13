/**
 * Web market-price search for account quotes.
 * Priority: Serper → Brave → Tavily → OpenAI web search → heuristic empty.
 * Never invent API keys; missing keys just skip that provider.
 */

import { getOpenAIKey, getOpenAIModel } from "./env";

export interface MarketHit {
  title: string;
  url: string;
  snippet: string;
}

export interface MarketSearchResult {
  query: string;
  provider: "serper" | "brave" | "tavily" | "openai_web" | "none";
  hits: MarketHit[];
  /** Raw text blob useful for price extraction / LLM synthesis */
  evidence: string;
}

function cleanEnv(raw: string | undefined): string {
  if (raw == null) return "";
  let v = String(raw).replace(/^\uFEFF/, "").trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1).trim();
  }
  return v.replace(/\r$/, "").trim();
}

export function getSerperKey(): string {
  return cleanEnv(process.env.SERPER_API_KEY);
}

export function getBraveKey(): string {
  return cleanEnv(process.env.BRAVE_API_KEY);
}

export function getTavilyKey(): string {
  return cleanEnv(process.env.TAVILY_API_KEY);
}

export function buildAccountPriceQuery(input: {
  platform: string;
  specs?: string[];
  quantity?: number;
  notes?: string;
}): string {
  const bits = [
    `buy ${input.platform} account`,
    ...(input.specs || []).slice(0, 4),
    input.notes ? String(input.notes).slice(0, 80) : "",
    "price USD",
    "marketplace",
    "G2G OR Eldorado OR PlayerUp OR AccsMarket",
  ].filter(Boolean);
  return bits.join(" ").replace(/\s+/g, " ").trim();
}

/** Pull plausible USD amounts from free text. */
export function extractUsdPrices(text: string): number[] {
  const out: number[] = [];
  const re =
    /(?:USD|US\$|\$)\s*([1-9]\d{0,3}(?:[.,]\d{1,2})?)|([1-9]\d{0,3}(?:[.,]\d{1,2})?)\s*(?:USD|dollars?)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const raw = (m[1] || m[2] || "").replace(",", "");
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 5 && n <= 5000) out.push(Math.round(n));
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

async function searchSerper(query: string): Promise<MarketSearchResult | null> {
  const key = getSerperKey();
  if (!key) return null;
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "X-API-KEY": key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ q: query, num: 8 }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`Serper ${res.status}`);
  const data = (await res.json()) as {
    organic?: { title?: string; link?: string; snippet?: string }[];
  };
  const hits: MarketHit[] = (data.organic || [])
    .slice(0, 8)
    .map((r) => ({
      title: r.title || "",
      url: r.link || "",
      snippet: r.snippet || "",
    }))
    .filter((h) => h.title || h.snippet);
  return {
    query,
    provider: "serper",
    hits,
    evidence: hits
      .map((h) => `${h.title}\n${h.snippet}\n${h.url}`)
      .join("\n\n"),
  };
}

async function searchBrave(query: string): Promise<MarketSearchResult | null> {
  const key = getBraveKey();
  if (!key) return null;
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", "8");
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": key,
    },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`Brave ${res.status}`);
  const data = (await res.json()) as {
    web?: { results?: { title?: string; url?: string; description?: string }[] };
  };
  const hits: MarketHit[] = (data.web?.results || [])
    .slice(0, 8)
    .map((r) => ({
      title: r.title || "",
      url: r.url || "",
      snippet: r.description || "",
    }))
    .filter((h) => h.title || h.snippet);
  return {
    query,
    provider: "brave",
    hits,
    evidence: hits
      .map((h) => `${h.title}\n${h.snippet}\n${h.url}`)
      .join("\n\n"),
  };
}

async function searchTavily(query: string): Promise<MarketSearchResult | null> {
  const key = getTavilyKey();
  if (!key) return null;
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: key,
      query,
      max_results: 8,
      search_depth: "basic",
      include_answer: false,
    }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`Tavily ${res.status}`);
  const data = (await res.json()) as {
    results?: { title?: string; url?: string; content?: string }[];
  };
  const hits: MarketHit[] = (data.results || [])
    .slice(0, 8)
    .map((r) => ({
      title: r.title || "",
      url: r.url || "",
      snippet: r.content || "",
    }))
    .filter((h) => h.title || h.snippet);
  return {
    query,
    provider: "tavily",
    hits,
    evidence: hits
      .map((h) => `${h.title}\n${h.snippet}\n${h.url}`)
      .join("\n\n"),
  };
}

/**
 * OpenAI Responses API + web_search tool (or chat search model fallback).
 * Uses the same OPENAI_API_KEY already bound for the seller brain.
 */
async function searchOpenAIWeb(query: string): Promise<MarketSearchResult | null> {
  const key = getOpenAIKey();
  if (!key) return null;

  const prompt = [
    "Search current public marketplace listings and forums for account sale prices.",
    "Return a short bullet list of observed USD prices and sources only.",
    "Query:",
    query,
  ].join("\n");

  // Prefer Responses API + web_search (works with standard chat models).
  try {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: getOpenAIModel() || "gpt-4o-mini",
        tools: [{ type: "web_search" }],
        input: prompt,
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(35_000),
    });

    if (res.ok) {
      const data = (await res.json()) as {
        output_text?: string;
        output?: {
          type?: string;
          content?: { type?: string; text?: string; annotations?: { url?: string; title?: string }[] }[];
        }[];
      };
      let text = data.output_text || "";
      const hits: MarketHit[] = [];
      for (const item of data.output || []) {
        if (item.type !== "message") continue;
        for (const part of item.content || []) {
          if (part.type === "output_text" && part.text) {
            text = text || part.text;
            for (const ann of part.annotations || []) {
              if (ann.url) {
                hits.push({
                  title: ann.title || "web result",
                  url: ann.url,
                  snippet: "",
                });
              }
            }
          }
        }
      }
      if (!text.trim()) throw new Error("OpenAI web search empty");
      if (hits.length === 0) {
        hits.push({
          title: "OpenAI web search synthesis",
          url: "",
          snippet: text.slice(0, 500),
        });
      } else {
        hits[0] = { ...hits[0], snippet: text.slice(0, 500) };
      }
      return {
        query,
        provider: "openai_web",
        hits,
        evidence: text,
      };
    }
    // Fall through to search-preview chat model on 4xx
    console.warn("[market-search] Responses web_search failed:", res.status);
  } catch (err) {
    console.warn(
      "[market-search] Responses web_search error:",
      err instanceof Error ? err.message : err
    );
  }

  // Chat Completions search model fallback
  const searchModel =
    cleanEnv(process.env.OPENAI_SEARCH_MODEL) || "gpt-4o-mini-search-preview";
  const res2 = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: searchModel,
      web_search_options: { search_context_size: "medium" },
      messages: [
        {
          role: "system",
          content:
            "You research public account marketplace prices. Reply with observed USD prices and source names only.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
    }),
    signal: AbortSignal.timeout(35_000),
  });
  if (!res2.ok) {
    const body = await res2.text();
    throw new Error(`OpenAI search ${res2.status}: ${body.slice(0, 200)}`);
  }
  const data2 = (await res2.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = data2.choices?.[0]?.message?.content?.trim() || "";
  if (!text) throw new Error("OpenAI search model empty");
  return {
    query,
    provider: "openai_web",
    hits: [
      {
        title: "OpenAI search model",
        url: "",
        snippet: text.slice(0, 500),
      },
    ],
    evidence: text,
  };
}

/** Run the first available search provider. */
export async function searchAccountMarket(
  query: string
): Promise<MarketSearchResult> {
  const providers = [searchSerper, searchBrave, searchTavily, searchOpenAIWeb];
  const errors: string[] = [];
  for (const fn of providers) {
    try {
      const result = await fn(query);
      if (result && (result.hits.length > 0 || result.evidence.trim())) {
        return result;
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  console.warn("[market-search] all providers failed:", errors.join("; "));
  return {
    query,
    provider: "none",
    hits: [],
    evidence: "",
  };
}
