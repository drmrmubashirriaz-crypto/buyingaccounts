import { NextResponse } from "next/server";
import { getChatModeStatus } from "@/lib/env";
import { allowAnonymousMockComplete } from "@/lib/mock-payments";
import { useMock } from "@/lib/suby";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const status = getChatModeStatus();
  return NextResponse.json({
    ...status,
    mockPayments: useMock(),
    allowMockComplete: allowAnonymousMockComplete(),
  });
}
