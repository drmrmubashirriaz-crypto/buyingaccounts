/**
 * Server-only env helpers. Never import from client components.
 * Next.js loads `.env.local` into process.env for API routes / server code.
 */

function cleanEnv(raw: string | undefined): string {
  if (raw == null) return "";
  let v = String(raw).replace(/^\uFEFF/, "").trim();
  // Strip wrapping quotes some Windows editors leave in
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1).trim();
  }
  // Drop accidental trailing CR from Windows CRLF files if not trimmed away
  v = v.replace(/\r$/, "").trim();
  return v;
}

/** Raw OpenAI API key if configured (never log this). */
export function getOpenAIKey(): string {
  return cleanEnv(process.env.OPENAI_API_KEY);
}

export function hasOpenAIKey(): boolean {
  return getOpenAIKey().length > 0;
}

export function getOpenAIModel(): string {
  return cleanEnv(process.env.OPENAI_MODEL) || "gpt-4o-mini";
}

export type ChatMode = "llm" | "rules";

export interface ChatModeStatus {
  mode: ChatMode;
  hasKey: boolean;
  model: string | null;
}

/** Intended mode from env — does not probe the network. */
export function getChatModeStatus(): ChatModeStatus {
  const hasKey = hasOpenAIKey();
  return {
    mode: hasKey ? "llm" : "rules",
    hasKey,
    model: hasKey ? getOpenAIModel() : null,
  };
}
