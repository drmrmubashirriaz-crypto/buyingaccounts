/**
 * Web market-price search for account quotes.
 *
 * Default when OPENAI_API_KEY is set: ChatGPT / OpenAI Responses API with
 * forced web_search (then search-preview chat models). Optional Serper /
 * Brave / Tavily only if those keys exist — never invent keys.
 */

import { getOpenAIKey, getOpenAIModel, hasOpenAIKey } from "./env";

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
  /** True when a web_search / search-model call actually ran */
  searchedOnline?: boolean;
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
    searchedOnline: true,
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
    searchedOnline: true,
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
    searchedOnline: true,
  };
}

type ResponsesPayload = {
  output_text?: string;
  output?: {
    type?: string;
    status?: string;
    action?: { type?: string; query?: string };
    content?: {
      type?: string;
      text?: string;
      annotations?: { type?: string; url?: string; title?: string }[];
    }[];
  }[];
};

function parseResponsesSearch(
  query: string,
  data: ResponsesPayload
): MarketSearchResult {
  let text = (data.output_text || "").trim();
  const hits: MarketHit[] = [];
  let didSearch = false;

  for (const item of data.output || []) {
    if (item.type === "web_search_call") {
      didSearch = true;
      continue;
    }
    if (item.type !== "message") continue;
    for (const part of item.content || []) {
      if (part.type === "output_text" && part.text) {
        if (!text) text = part.text.trim();
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

  if (!text) {
    throw new Error("OpenAI Responses web search returned empty text");
  }

  if (hits.length === 0) {
    hits.push({
      title: "OpenAI web search",
      url: "",
      snippet: text.slice(0, 500),
    });
  } else {
    hits[0] = { ...hits[0], snippet: text.slice(0, 500) };
  }

  void didSearch;
  return {
    query,
    provider: "openai_web",
    hits,
    evidence: text,
    // Successful OpenAI Responses/search path = online research ran
    searchedOnline: true,
  };
}

async function callResponsesWebSearch(
  key: string,
  model: string,
  prompt: string,
  toolType: "web_search" | "web_search_preview",
  toolChoice: "required" | Record<string, string>
): Promise<ResponsesPayload> {
  const body: Record<string, unknown> = {
    model,
    tools: [{ type: toolType }],
    tool_choice: toolChoice,
    input: prompt,
  };
  // Some models reject temperature with hosted tools — omit it.

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45_000),
  });

  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`Responses ${toolType} ${res.status}: ${raw.slice(0, 280)}`);
  }
  return JSON.parse(raw) as ResponsesPayload;
}

async function callChatSearchModel(
  key: string,
  model: string,
  prompt: string
): Promise<MarketSearchResult> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      web_search_options: { search_context_size: "medium" },
      messages: [
        {
          role: "system",
          content:
            "You always search the live web for public account marketplace prices. Reply with observed USD prices and source names only.",
        },
        { role: "user", content: prompt },
      ],
    }),
    signal: AbortSignal.timeout(45_000),
  });
  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`Chat search ${model} ${res.status}: ${raw.slice(0, 280)}`);
  }
  const data = JSON.parse(raw) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = data.choices?.[0]?.message?.content?.trim() || "";
  if (!text) throw new Error(`Chat search ${model} empty`);
  return {
    query: prompt.slice(0, 200),
    provider: "openai_web",
    hits: [
      {
        title: `OpenAI ${model}`,
        url: "",
        snippet: text.slice(0, 500),
      },
    ],
    evidence: text,
    searchedOnline: true,
  };
}

/**
 * Force OpenAI/ChatGPT to search the web for market prices.
 * Tries Responses web_search (required) → web_search_preview → chat search models.
 */
async function searchOpenAIWeb(query: string): Promise<MarketSearchResult | null> {
  const key = getOpenAIKey();
  if (!key) return null;

  const model = getOpenAIModel() || "gpt-4o-mini";
  const prompt = [
    "You MUST use web search. Search current public marketplace listings and forums for account sale prices right now.",
    "Return a short bullet list of observed USD prices and sources (site names / URLs) only. No refusal.",
    "Query:",
    query,
  ].join("\n");

  const attempts: Array<() => Promise<MarketSearchResult>> = [
    async () =>
      parseResponsesSearch(
        query,
        await callResponsesWebSearch(key, model, prompt, "web_search", "required")
      ),
    async () =>
      parseResponsesSearch(
        query,
        await callResponsesWebSearch(key, model, prompt, "web_search", {
          type: "web_search",
        })
      ),
    async () =>
      parseResponsesSearch(
        query,
        await callResponsesWebSearch(
          key,
          model,
          prompt,
          "web_search_preview",
          "required"
        )
      ),
    async () =>
      parseResponsesSearch(
        query,
        await callResponsesWebSearch(
          key,
          model,
          prompt,
          "web_search_preview",
          { type: "web_search_preview" }
        )
      ),
    async () =>
      callChatSearchModel(
        key,
        cleanEnv(process.env.OPENAI_SEARCH_MODEL) || "gpt-4o-mini-search-preview",
        prompt
      ),
    async () => callChatSearchModel(key, "gpt-4o-search-preview", prompt),
  ];

  const errors: string[] = [];
  for (const attempt of attempts) {
    try {
      const result = await attempt();
      if (result.evidence.trim()) {
        result.query = query;
        return result;
      }
      errors.push("empty evidence");
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  throw new Error(
    `OpenAI web search exhausted: ${errors.slice(0, 4).join(" | ")}`
  );
}

/**
 * Run search providers. With OPENAI_API_KEY set, ChatGPT web search runs first.
 */
export async function searchAccountMarket(
  query: string
): Promise<MarketSearchResult> {
  const providers = hasOpenAIKey()
    ? [searchOpenAIWeb, searchSerper, searchBrave, searchTavily]
    : [searchSerper, searchBrave, searchTavily, searchOpenAIWeb];

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
    searchedOnline: false,
  };
}
