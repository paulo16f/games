import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { confirmClaimFliesSkipIntent } from "@/lib/payment-engine";
import { kvConfigured } from "@/lib/config";
import { pgConfigured } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const session = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
    if (!session) {
      return NextResponse.json({ error: "Wallet signature session required" }, { status: 401 });
    }

    const body = await req.json() as {
      intentId?: unknown;
      signature?: unknown;
    };
    if (typeof body.intentId !== "string" || typeof body.signature !== "string") {
      return NextResponse.json({ error: "intentId and signature are required" }, { status: 400 });
    }

    const data = await confirmClaimFliesSkipIntent(session.wallet, body.intentId, body.signature);
    return NextResponse.json({ ...data, kvOk: kvConfigured(), pgOk: pgConfigured() });
  } catch (error) {
    return apiError(error);
  }
}
