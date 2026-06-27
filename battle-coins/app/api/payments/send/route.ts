import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { sendSignedPaymentTransaction } from "@/lib/payment-engine";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const session = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
    if (!session) {
      return NextResponse.json({ error: "Wallet signature session required" }, { status: 401 });
    }

    const body = await req.json() as {
      intentId?: unknown;
      signedTransactionBase64?: unknown;
    };
    if (typeof body.intentId !== "string" || typeof body.signedTransactionBase64 !== "string") {
      return NextResponse.json({ error: "intentId and signedTransactionBase64 are required" }, { status: 400 });
    }

    const signature = await sendSignedPaymentTransaction(body.intentId, session.wallet, body.signedTransactionBase64);
    return NextResponse.json({ signature });
  } catch (error) {
    return apiError(error);
  }
}
