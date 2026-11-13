/**
 * Per-viewer bounds on checkout creation (rate + amount + daily spend).
 */

import { NextResponse } from "next/server";
import { consume } from "@/lib/rate-limit";

const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * 60 * 60_000;

const MIN_USD = 15;
const MAX_USD = 5_000;
const MAX_CHECKOUTS_PER_HOUR = Number(
  process.env.CHECKOUT_RATE_PER_HOUR || 5
);
const MAX_SPEND_PER_DAY = Number(process.env.CHECKOUT_MAX_SPEND_PER_DAY || 2_000);

export type CheckoutGuardOk = { ok: true; amountUsd: number };
export type CheckoutGuardFail = { ok: false; response: NextResponse };

export function guardCheckoutCreate(
  ownerSub: string,
  amountUsd: number
): CheckoutGuardOk | CheckoutGuardFail {
  const amount = Number(amountUsd);
  if (!Number.isFinite(amount) || amount < MIN_USD || amount > MAX_USD) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "invalid_amount",
          minUsd: MIN_USD,
          maxUsd: MAX_USD,
        },
        { status: 400, headers: { "Cache-Control": "private, no-store" } }
      ),
    };
  }

  const rate = consume(
    `checkout:hour:${ownerSub}`,
    1,
    MAX_CHECKOUTS_PER_HOUR,
    HOUR_MS
  );
  if (!rate.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "checkout_rate_limited",
          retryAfterSec: rate.retryAfterSec,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(rate.retryAfterSec),
            "Cache-Control": "private, no-store",
          },
        }
      ),
    };
  }

  const spend = consume(
    `checkout:spend:${ownerSub}`,
    Math.ceil(amount),
    MAX_SPEND_PER_DAY,
    DAY_MS
  );
  if (!spend.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "checkout_spend_limited",
          maxSpendPerDay: MAX_SPEND_PER_DAY,
          retryAfterSec: spend.retryAfterSec,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(spend.retryAfterSec),
            "Cache-Control": "private, no-store",
          },
        }
      ),
    };
  }

  return { ok: true, amountUsd: Math.round(amount * 100) / 100 };
}
