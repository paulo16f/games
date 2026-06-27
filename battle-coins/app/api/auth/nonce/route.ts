import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { createAuthNonce } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { wallet?: unknown };
    if (typeof body.wallet !== "string" || !body.wallet.trim()) {
      return NextResponse.json({ error: "wallet required" }, { status: 400 });
    }
    const nonce = await createAuthNonce(body.wallet.trim());
    return NextResponse.json(nonce);
  } catch (error) {
    return apiError(error);
  }
}
