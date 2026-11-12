import { NextRequest, NextResponse } from "next/server";
import { createCheckout } from "@/lib/suby";

export const runtime = "nodejs";

/** Low-level checkout create — normally the chat bot calls this via /api/chat. */
export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    amountUsd?: number;
    orderId?: string;
    description?: string;
  };

  if (!body.amountUsd || !body.orderId) {
    return NextResponse.json(
      { error: "amountUsd and orderId required" },
      { status: 400 }
    );
  }

  const checkout = await createCheckout({
    amountUsd: body.amountUsd,
    orderId: body.orderId,
    description: body.description || `Order ${body.orderId}`,
  });

  return NextResponse.json({ checkout });
}
