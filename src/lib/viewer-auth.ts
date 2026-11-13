/**
 * Bind chats/orders to the signed-in Cursor viewer (identity.sub).
 * On the published host, requireIdentity is mandatory for buyer routes.
 */

import { NextResponse } from "next/server";
import {
  requireIdentity,
  type PersonIdentity,
  type KeyIdentity,
} from "../../cursor/identity";
import type { ChatSession, Order } from "@/lib/types";

export type ViewerIdentity = PersonIdentity | KeyIdentity;

const NO_STORE = {
  "Cache-Control": "private, no-store",
} as const;

export async function requireViewer(
  req: Request
): Promise<ViewerIdentity | NextResponse> {
  const identity = await requireIdentity(req);
  if (identity instanceof Response) {
    return NextResponse.json(
      { error: "unauthorized", reason: "identity_required" },
      { status: 401, headers: NO_STORE }
    );
  }
  return identity;
}

export function ownsChat(
  chat: ChatSession | null | undefined,
  ownerSub: string
): chat is ChatSession {
  return Boolean(chat && chat.ownerSub && chat.ownerSub === ownerSub);
}

export function ownsOrder(
  order: Order | null | undefined,
  ownerSub: string
): order is Order {
  return Boolean(order && order.ownerSub && order.ownerSub === ownerSub);
}

export function forbidden(): NextResponse {
  return NextResponse.json(
    { error: "forbidden" },
    { status: 403, headers: NO_STORE }
  );
}

export function jsonPrivate(data: unknown, init?: { status?: number }) {
  return NextResponse.json(data, {
    status: init?.status ?? 200,
    headers: NO_STORE,
  });
}
