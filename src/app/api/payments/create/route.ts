import { NextRequest, NextResponse } from "next/server";
import { guardCheckoutCreate } from "@/lib/checkout-guard";
import { createCheckout } from "@/lib/suby";
import { requireViewer } from "@/lib/viewer-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Low-level checkout create — normally the chat bot calls this via /api/chat. */
export async function POST(req: NextRequest) {
  const viewer = await requireViewer(req);
  if (viewer instanceof NextResponse) return viewer;

  const body = (await req.json()) as {
    amountUsd?: number;
    orderId?: string;
    description?: string;
  };

  if (body.amountUsd == null || !body.orderId) {
    return NextResponse.json(
      { error: "amountUsd and orderId required" },
      { status: 400 }
    );
  }

  const gated = guardCheckoutCreate(viewer.sub, body.amountUsd);
  if (!gated.ok) return gated.response;

  const checkout = await createCheckout({
    amountUsd: gated.amountUsd,
    orderId: body.orderId,
    description: body.description || `Order ${body.orderId}`,
  });

  return NextResponse.json(
    { checkout },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
