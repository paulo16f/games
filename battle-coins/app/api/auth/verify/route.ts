import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { createSessionToken, sessionCookieOptions, SESSION_COOKIE, verifySiwsSignature } from "@/lib/auth";
import { checkToadJumpGate } from "@/lib/token-gate";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      wallet?: unknown;
      nonce?: unknown;
      message?: unknown;
      signature?: unknown;
    };

    if (
      typeof body.wallet !== "string" ||
      typeof body.nonce !== "string" ||
      typeof body.message !== "string"
    ) {
      return NextResponse.json({ error: "wallet, nonce, and message are required" }, { status: 400 });
    }

    const wallet = await verifySiwsSignature({
      wallet: body.wallet,
      nonce: body.nonce,
      message: body.message,
      signature: body.signature,
    });
    const gate = await checkToadJumpGate(wallet);

    const res = NextResponse.json({ wallet, gate });
    res.cookies.set(SESSION_COOKIE, createSessionToken(wallet), sessionCookieOptions);
    return res;
  } catch (error) {
    return apiError(error);
  }
}
