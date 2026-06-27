import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { checkToadJumpGate } from "@/lib/token-gate";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
    if (!session) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    const gate = await checkToadJumpGate(session.wallet);
    return NextResponse.json({ authenticated: true, wallet: session.wallet, gate });
  } catch (error) {
    return apiError(error);
  }
}
