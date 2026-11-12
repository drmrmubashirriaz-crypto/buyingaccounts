import type { NextRequest } from "next/server";
import { getAdminKey } from "@/lib/env";

/** Header-only admin gate. Never accept query-string keys. */
export function isAdminAuthorized(req: NextRequest): boolean {
  const key = getAdminKey();
  if (!key) return false;
  const header = req.headers.get("x-admin-key");
  return Boolean(header && header === key);
}
