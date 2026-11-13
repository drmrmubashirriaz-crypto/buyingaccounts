import { useMock } from "@/lib/suby";

function isPublishedHost(): boolean {
  return Boolean(process.env.CURSOR_APP_ID?.trim());
}

/** True only on local dev with mock Suby — never on published hosts. */
export function allowAnonymousMockComplete(): boolean {
  if (isPublishedHost()) return false;
  return useMock() && process.env.NODE_ENV === "development";
}

/**
 * Mock complete endpoint enabled?
 * Published Cursor apps default OFF unless SUBY_MOCK=true (still needs requireAdmin).
 */
export function mockPaymentsEnabled(): boolean {
  if (isPublishedHost() && process.env.SUBY_MOCK !== "true") {
    return false;
  }
  return useMock();
}
