import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireIdentity } from "../../cursor/identity";
import { getAdminKey } from "@/lib/env";

/** Header-only admin key check. Never accept query-string keys. */
export function isAdminKeyValid(req: NextRequest): boolean {
  const key = getAdminKey();
  if (!key) return false;
  const header = req.headers.get("x-admin-key");
  return Boolean(header && header === key);
}

/**
 * Admin routes require a signed-in Cursor viewer AND a valid ADMIN_KEY header.
 * Stops a shared key alone from authorizing unauthenticated callers.
 */
export async function requireAdmin(
  req: NextRequest
): Promise<true | NextResponse> {
  const identity = await requireIdentity(req);
  if (identity instanceof Response) {
    return NextResponse.json(
      { error: "unauthorized", reason: "identity_required" },
      { status: 401, headers: { "Cache-Control": "private, no-store" } }
    );
  }
  if (!isAdminKeyValid(req)) {
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: { "Cache-Control": "private, no-store" } }
    );
  }
  return true;
}

/** @deprecated prefer requireAdmin — sync key-only check kept for mock-complete */
export function isAdminAuthorized(req: NextRequest): boolean {
  return isAdminKeyValid(req);
}
