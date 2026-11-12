import { NextRequest, NextResponse } from "next/server";
import { getIdentity } from "../../cursor/identity";
import { consume } from "@/lib/rate-limit";

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * 60_000;

function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return req.headers.get("x-real-ip") || "unknown";
}

function limits() {
  return {
    perMin: Number(process.env.CHAT_RATE_LIMIT_PER_MIN || 20),
    perDay: Number(process.env.CHAT_MAX_TURNS_PER_DAY || 200),
    tokensPerDay: Number(process.env.CHAT_MAX_TOKENS_PER_DAY || 100_000),
  };
}

export type ChatGuardOk = { ok: true; subject: string };

export type ChatGuardFail = { ok: false; response: NextResponse };

/**
 * Bind chat spend to a Cursor viewer when identity is present;
 * always enforce per-minute / per-day turn and token budgets.
 */
export async function guardChatTurn(
  req: NextRequest,
  message: string
): Promise<ChatGuardOk | ChatGuardFail> {
  const identity = await getIdentity(req);
  const published = Boolean(process.env.CURSOR_APP_ID?.trim());

  // On the published host, prefer a verified Cursor viewer.
  // Public apps may have no identity — fall back to IP rate limits only.
  if (published && !identity.verified) {
    // Still allow with IP limits so a public deploy keeps working.
    // Private/team apps normally always send identity at the gate.
  }

  const subject = identity.verified
    ? `viewer:${identity.sub}`
    : `ip:${clientIp(req)}`;

  const { perMin, perDay, tokensPerDay } = limits();

  const minute = consume(`chat:min:${subject}`, 1, perMin, MINUTE_MS);
  if (!minute.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "rate_limited", scope: "minute", retryAfterSec: minute.retryAfterSec },
        {
          status: 429,
          headers: { "Retry-After": String(minute.retryAfterSec) },
        }
      ),
    };
  }

  const day = consume(`chat:day:${subject}`, 1, perDay, DAY_MS);
  if (!day.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "rate_limited", scope: "day", retryAfterSec: day.retryAfterSec },
        {
          status: 429,
          headers: { "Retry-After": String(day.retryAfterSec) },
        }
      ),
    };
  }

  // Rough token estimate for the inbound message (outbound counted lightly after).
  const approxIn = Math.max(1, Math.ceil(message.length / 4));
  const tokens = consume(
    `chat:tok:${subject}`,
    approxIn + 500,
    tokensPerDay,
    DAY_MS
  );
  if (!tokens.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "token_budget_exceeded",
          scope: "day",
          retryAfterSec: tokens.retryAfterSec,
        },
        {
          status: 429,
          headers: { "Retry-After": String(tokens.retryAfterSec) },
        }
      ),
    };
  }

  return { ok: true, subject };
}

/** SSE-friendly rate-limit failure (same status/body as JSON guard). */
export async function guardChatTurnSse(
  req: NextRequest,
  message: string
): Promise<ChatGuardOk | { ok: false; status: number; body: unknown; retryAfterSec?: number }> {
  const result = await guardChatTurn(req, message);
  if (result.ok) return result;
  const retry = result.response.headers.get("Retry-After");
  const body = await result.response.json().catch(() => ({ error: "rate_limited" }));
  return {
    ok: false,
    status: result.response.status,
    body,
    retryAfterSec: retry ? Number(retry) : undefined,
  };
}
