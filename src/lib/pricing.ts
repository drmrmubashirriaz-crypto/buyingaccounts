/**
 * Soft heuristic pricing — last-resort only when web market research
 * cannot produce signals. Never refuse a normal platform (CODM, etc.).
 * Illegal / unsafe requests still decline.
 */

export interface PricingInput {
  platform: string;
  specs: string[];
  quantity: number;
  rawText?: string;
}

export interface PricingResult {
  priceUsd: number;
  platform: string;
  summary: string;
  specs: string[];
  quantity: number;
  declined?: boolean;
  declineReason?: string;
}

/** Optional base hints for the no-search fallback path only. */
const PLATFORM_HINT: Record<string, { label: string; base: number }> = {
  twitter: { label: "Twitter / X", base: 45 },
  x: { label: "Twitter / X", base: 45 },
  instagram: { label: "Instagram", base: 55 },
  ig: { label: "Instagram", base: 55 },
  facebook: { label: "Facebook", base: 40 },
  fb: { label: "Facebook", base: 40 },
  tiktok: { label: "TikTok", base: 60 },
  youtube: { label: "YouTube", base: 90 },
  discord: { label: "Discord", base: 35 },
  steam: { label: "Steam", base: 50 },
  epic: { label: "Epic Games", base: 45 },
  "epic games": { label: "Epic Games", base: 45 },
  fortnite: { label: "Fortnite", base: 70 },
  roblox: { label: "Roblox", base: 40 },
  valorant: { label: "Valorant", base: 65 },
  "league of legends": { label: "League of Legends", base: 55 },
  lol: { label: "League of Legends", base: 55 },
  codm: { label: "CODM", base: 65 },
  "call of duty mobile": { label: "CODM", base: 65 },
  "cod mobile": { label: "CODM", base: 65 },
  "call of duty": { label: "CODM", base: 65 },
  gmail: { label: "Gmail", base: 25 },
  google: { label: "Google", base: 30 },
  reddit: { label: "Reddit", base: 35 },
  snapchat: { label: "Snapchat", base: 50 },
  telegram: { label: "Telegram", base: 30 },
  linkedin: { label: "LinkedIn", base: 80 },
  twitch: { label: "Twitch", base: 55 },
  gaming: { label: "Gaming account", base: 60 },
};

const PLATFORM_ALIASES: Record<string, string> = {
  codm: "codm",
  "c.o.d.m": "codm",
  "cod:m": "codm",
  "cod m": "codm",
  codmobile: "codm",
  "cod mobile": "codm",
  "call of duty mobile": "codm",
  "call of duty: mobile": "codm",
  "call of duty": "codm",
  cod: "codm",
  "twitter / x": "twitter",
  "twitter/x": "twitter",
  "epic games": "epic",
  "league of legends": "lol",
  "gaming account": "gaming",
};

/** Only hard-block underage requests. Every other account type gets a quote. */
const REFUSED = [/underage|child\s*account|\bminors?\b/i];

export function resolvePlatformKey(platform: string): string | undefined {
  const raw = platform.toLowerCase().trim();
  if (!raw) return undefined;
  if (PLATFORM_HINT[raw]) return raw;
  const aliased = PLATFORM_ALIASES[raw];
  if (aliased && PLATFORM_HINT[aliased]) return aliased;
  const compact = raw.replace(/[^a-z0-9]+/g, " ").trim();
  if (PLATFORM_HINT[compact]) return compact;
  const compactAlias = PLATFORM_ALIASES[compact];
  if (compactAlias && PLATFORM_HINT[compactAlias]) return compactAlias;
  // Exact / token match only — do not treat "x" inside "netflix" as Twitter
  const keys = Object.keys(PLATFORM_HINT).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (includesPlatformToken(compact, key) || includesPlatformToken(raw, key)) {
      return key;
    }
  }
  for (const [alias, key] of Object.entries(PLATFORM_ALIASES)) {
    if (
      includesPlatformToken(compact, alias) ||
      includesPlatformToken(raw, alias)
    ) {
      return key;
    }
  }
  return undefined;
}

/** Free-form “Netflix account” / “need Spotify” → platform label. */
export function extractFreeformPlatform(text: string): string | undefined {
  const m = text.match(
    /\b(?:buy|need|want|looking for|get|quote|for)?\s*([a-z0-9][a-z0-9+._\-]{1,32})\s+accounts?\b/i
  );
  if (m?.[1]) {
    const raw = m[1].toLowerCase();
    if (!/^(an|a|the|my|one|some|any|new|old|good|best)$/.test(raw)) {
      return raw;
    }
  }
  const m2 = text.match(
    /\b(?:buy|need|want|looking for)\s+(?:a|an|some)?\s*([a-z0-9][a-z0-9+._\-]{1,32})\b/i
  );
  if (m2?.[1] && !/^(account|accounts|price|quote|one)$/i.test(m2[1])) {
    return m2[1].toLowerCase();
  }
  return undefined;
}

function includesPlatformToken(haystack: string, token: string): boolean {
  const t = token.toLowerCase();
  // Short tokens (x, ig, fb, lol) must be whole words — avoid "x" in "netflix"
  if (t.length <= 3) {
    return new RegExp(
      `(^|[^a-z0-9])${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`,
      "i"
    ).test(haystack);
  }
  return haystack.includes(t);
}

export function detectPlatform(text: string): string | undefined {
  const lower = text.toLowerCase();
  const keys = Object.keys(PLATFORM_HINT).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (includesPlatformToken(lower, key)) return key;
  }
  for (const [alias, key] of Object.entries(PLATFORM_ALIASES)) {
    if (includesPlatformToken(lower, alias)) return key;
  }
  if (/\bx\b/.test(lower) && /account|handle|followers|2009|2010/.test(lower)) {
    return "twitter";
  }
  if (/\bcod\b/i.test(lower) && /mobile|account|level|cp/i.test(lower)) {
    return "codm";
  }
  return extractFreeformPlatform(text);
}

export function extractYear(text: string): number | undefined {
  const m = text.match(/\b(19|20)\d{2}\b/);
  return m ? Number(m[0]) : undefined;
}

export function extractQuantity(text: string): number {
  const mult = text.match(
    /\b(\d{1,2})\s*x\b|\bx\s*(\d{1,2})\b|\bqty[:\s]+(\d{1,2})\b/i
  );
  if (mult) {
    const n = Number(mult[1] || mult[2] || mult[3]);
    return Math.min(20, Math.max(1, n));
  }
  const m = text.match(/\b(\d{1,2})\s*(accounts?|pcs?)\b/i);
  if (m) {
    const n = Number(m[1]);
    if (n >= 1 && n <= 20) return n;
  }
  return 1;
}

function rarityMultiplier(text: string, platform: string): number {
  let mult = 1;
  const year = extractYear(text);
  if (year) {
    if (year <= 2009) mult += 1.8;
    else if (year <= 2012) mult += 1.2;
    else if (year <= 2015) mult += 0.7;
    else if (year <= 2018) mult += 0.35;
  }
  if (/aged|old|vintage|rare/i.test(text)) mult += 0.4;
  if (/verified|blue.?check|tick/i.test(text)) mult += 0.9;
  if (/followers?|subs?/i.test(text)) {
    const n = text.match(/(\d[\d,]*)\s*(k)?\s*(followers?|subs?)/i);
    if (n) {
      let count = Number(n[1].replace(/,/g, ""));
      if (n[2]) count *= 1000;
      if (count >= 100000) mult += 2;
      else if (count >= 10000) mult += 1.1;
      else if (count >= 1000) mult += 0.5;
    }
  }
  if (/level\s*\d+|cp\s*\d+|rank|skins?|og/i.test(text)) mult += 0.45;
  if (/200\s*cp|cp\s*200/i.test(text)) mult += 0.35;
  if (platform === "fortnite" || platform === "valorant" || platform === "codm") {
    if (/skins?|battle.?pass|radiant|immortal|legendary|mythic/i.test(text)) {
      mult += 0.6;
    }
  }
  if (platform === "codm") {
    const level = text.match(/level\s*(\d+)/i);
    if (level) {
      const n = Number(level[1]);
      if (n >= 300) mult += 0.55;
      else if (n >= 150) mult += 0.35;
      else if (n >= 50) mult += 0.2;
    }
  }
  return mult;
}

function collectSpecs(text: string): string[] {
  const specs: string[] = [];
  const year = extractYear(text);
  if (year) specs.push(`Created ~${year}`);
  const followers = text.match(/(\d[\d,]*)\s*(k)?\s*(followers?|subs?)/i);
  if (followers) {
    specs.push(
      `${followers[1]}${followers[2] ? "k" : ""} ${followers[3].toLowerCase()}`
    );
  }
  const level = text.match(/level\s*(\d+)/i);
  if (level) specs.push(`Level ${level[1]}`);
  const cp = text.match(/(\d+)\s*cp|cp\s*(\d+)/i);
  if (cp) specs.push(`${cp[1] || cp[2]} CP`);
  if (/verified|blue.?check/i.test(text)) specs.push("Verified");
  if (/aged|old|og/i.test(text)) specs.push("Aged / OG");
  if (/email.?access|full.?access|changeable/i.test(text)) {
    specs.push("Full access");
  }
  if (specs.length === 0) {
    specs.push("Standard account matching your description");
  }
  return specs.slice(0, 6);
}

function prettyLabel(platform: string, key?: string): string {
  if (key && PLATFORM_HINT[key]) return PLATFORM_HINT[key].label;
  if (/^codm$/i.test(platform) || /call of duty/i.test(platform)) return "CODM";
  const t = platform.trim();
  if (!t) return "Account";
  return t.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Soft heuristic quote. Unknown platforms get a gaming-like base — never
 * "I can't quote X" for normal account requests.
 */
export function heuristicMarketQuote(
  input: PricingInput,
  opts?: { forceHeuristic?: boolean }
): PricingResult {
  void opts;
  const blob = [input.platform, ...input.specs, input.rawText ?? ""]
    .join(" ")
    .trim();

  for (const rule of REFUSED) {
    if (rule.test(blob)) {
      return {
        priceUsd: 0,
        platform: input.platform,
        summary: "",
        specs: [],
        quantity: input.quantity,
        declined: true,
        declineReason:
          "I can’t help with underage account requests. Ask for an adult account type and I’ll quote a fixed price.",
      };
    }
  }

  const key = resolvePlatformKey(input.platform);
  const hint = key ? PLATFORM_HINT[key] : undefined;
  const base = hint?.base ?? 60; // generic gaming / social fallback
  const label = prettyLabel(input.platform, key);
  const qty = Math.min(20, Math.max(1, input.quantity || 1));
  const mult = rarityMultiplier(blob, key || "gaming");
  const unit = Math.round(base * mult);
  const priceUsd = Math.max(15, unit * qty);
  const specs =
    input.specs.length > 0 ? input.specs : collectSpecs(blob);

  return {
    priceUsd,
    platform: label,
    summary: `${qty > 1 ? `${qty}× ` : ""}${label} account — ${specs.join(", ")}`,
    specs,
    quantity: qty,
  };
}

/** @deprecated Prefer researchMarketQuote — kept for callers/tests. */
export function quoteFixedPrice(input: PricingInput): PricingResult {
  return heuristicMarketQuote(input);
}

export function knownPlatforms(): string[] {
  return [
    ...new Set(Object.values(PLATFORM_HINT).map((p) => p.label)),
  ].sort();
}
