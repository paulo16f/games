import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { getPlayer } from "@/lib/repository";
import { rewardStatus } from "@/lib/reward-engine";
import { requireToadJumpGate } from "@/lib/token-gate";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
    if (!session) {
      return NextResponse.json({ error: "Wallet signature session required" }, { status: 401 });
    }

    const gateResult = await requireToadJumpGate(session.wallet);
    if (gateResult.error) {
      return NextResponse.json(
        { error: gateResult.error, gate: gateResult.gate },
        { status: gateResult.status }
      );
    }

    const player = await getPlayer(gateResult.gate.wallet);
    return NextResponse.json({
      gate: gateResult.gate,
      rewards: await rewardStatus(player),
    });
  } catch (error) {
    return apiError(error);
  }
}
