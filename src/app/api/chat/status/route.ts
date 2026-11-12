import { NextResponse } from "next/server";
import { getChatModeStatus } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Honest mode probe for the UI badge.
 * Returns { mode, hasKey, model } — never the API key itself.
 */
export async function GET() {
  const status = getChatModeStatus();
  return NextResponse.json({
    mode: status.mode,
    hasKey: status.hasKey,
    model: status.model,
  });
}
