/**
 * Simple in-memory sliding window counters (single instance).
 * Good enough to bound OpenAI spend on the published app.
 */

type Bucket = { used: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function consume(
  key: string,
  amount: number,
  limit: number,
  windowMs: number
): { ok: true } | { ok: false; retryAfterSec: number } {
  if (limit <= 0) return { ok: true };
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { used: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }
  if (bucket.used + amount > limit) {
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }
  bucket.used += amount;
  return { ok: true };
}
