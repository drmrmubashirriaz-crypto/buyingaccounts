/**
 * Fixed-price brain for v1.
 * No inventory DB — quotes come from platform base + rarity/age/spec modifiers.
 * Tune these rules so quotes stay profitable vs sourcing cost.
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

const PLATFORM_BASE: Record<string, { label: string; base: number }> = {
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
  gmail: { label: "Gmail", base: 25 },
  google: { label: "Google", base: 30 },
  reddit: { label: "Reddit", base: 35 },
  snapchat: { label: "Snapchat", base: 50 },
  telegram: { label: "Telegram", base: 30 },
  linkedin: { label: "LinkedIn", base: 80 },
  twitch: { label: "Twitch", base: 55 },
  gaming: { label: "Gaming account", base: 60 },
};

const REFUSED = [
  /bank/i,
  /paypal.*verified.*stolen/i,
  /hack(ed|ing)?\b/i,
  /stolen/i,
  /crack(ed)?\b/i,
  /phishing/i,
  /ssn|passport|id card/i,
  /underage|child|minor/i,
];

export function detectPlatform(text: string): string | undefined {
  const lower = text.toLowerCase();
  const keys = Object.keys(PLATFORM_BASE).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (lower.includes(key)) return key;
  }
  // Common aliases
  if (/\bx\b/.test(lower) && /account|handle|followers|2009|2010/.test(lower)) {
    return "twitter";
  }
  return undefined;
}

export function extractYear(text: string): number | undefined {
  const m = text.match(/\b(19|20)\d{2}\b/);
  return m ? Number(m[0]) : undefined;
}

export function extractQuantity(text: string): number {
  // Explicit multipliers: "3x", "x3", "qty 2" — never treat years (2009) as qty
  const mult = text.match(/\b(\d{1,2})\s*x\b|\bx\s*(\d{1,2})\b|\bqty[:\s]+(\d{1,2})\b/i);
  if (mult) {
    const n = Number(mult[1] || mult[2] || mult[3]);
    return Math.min(20, Math.max(1, n));
  }
  const m = text.match(/\b(\d{1,2})\s*(accounts?|pcs?)\b/i);
  if (m) {
    const n = Number(m[1]);
    // Ignore 4-digit-looking noise; years are handled separately
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
  if (platform === "fortnite" || platform === "valorant") {
    if (/skins?|battle.?pass|radiant|immortal/i.test(text)) mult += 0.6;
  }
  return mult;
}

function collectSpecs(text: string, platform: string): string[] {
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
  // Keep platform label out of duplicate noise
  void platform;
  return specs.slice(0, 6);
}

export function quoteFixedPrice(input: PricingInput): PricingResult {
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
          "I can’t help with that request. Rephrase with a legitimate account type and I’ll quote a fixed price.",
      };
    }
  }

  const key = input.platform.toLowerCase().trim();
  const baseEntry = PLATFORM_BASE[key];
  if (!baseEntry) {
    return {
      priceUsd: 0,
      platform: input.platform,
      summary: "",
      specs: input.specs,
      quantity: input.quantity,
      declined: true,
      declineReason: `I don’t have pricing rules for “${input.platform}” yet. Name a platform I cover (Twitter/X, Instagram, TikTok, Steam, Fortnite, Discord, etc.) and I’ll quote you.`,
    };
  }

  const qty = Math.min(20, Math.max(1, input.quantity || 1));
  const mult = rarityMultiplier(blob, key);
  const unit = Math.round(baseEntry.base * mult);
  const priceUsd = Math.max(15, unit * qty);
  const specs =
    input.specs.length > 0 ? input.specs : collectSpecs(blob, key);

  return {
    priceUsd,
    platform: baseEntry.label,
    summary: `${qty > 1 ? `${qty}× ` : ""}${baseEntry.label} account — ${specs.join(", ")}`,
    specs,
    quantity: qty,
  };
}

export function knownPlatforms(): string[] {
  return [
    ...new Set(Object.values(PLATFORM_BASE).map((p) => p.label)),
  ].sort();
}
