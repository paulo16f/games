import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { createClaimFliesSkipIntent } from "@/lib/payment-engine";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const session = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
    if (!session) {
      return NextResponse.json({ error: "Wallet signature session required" }, { status: 401 });
    }

    const body = await req.json() as { purpose?: unknown };
    if (body.purpose !== "claim_flies_skip") {
      return NextResponse.json({ error: "Unsupported payment purpose" }, { status: 400 });
    }

    const intent = await createClaimFliesSkipIntent(session.wallet);
    return NextResponse.json({
      intentId: intent.id,
      purpose: intent.purpose,
      wallet: intent.wallet,
      mint: intent.mint,
      sourceTokenAccount: intent.sourceTokenAccount,
      destinationTokenAccount: intent.destinationTokenAccount,
      amountUi: intent.amountUi,
      amountRaw: intent.amountRaw,
      decimals: intent.decimals,
      transactionBase64: intent.transactionBase64,
      blockhash: intent.blockhash,
      expiresAt: intent.expiresAt,
    });
  } catch (error) {
    return apiError(error);
  }
}
