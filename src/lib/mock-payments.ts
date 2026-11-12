import { useMock } from "@/lib/suby";

/** True only when mock Suby is on AND this process is a local dev server. */
export function allowAnonymousMockComplete(): boolean {
  return useMock() && process.env.NODE_ENV === "development";
}

/** Mock complete may run in production only with a valid ADMIN_KEY header. */
export function mockPaymentsEnabled(): boolean {
  return useMock();
}
