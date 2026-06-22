import { NextRequest, NextResponse } from "next/server";
import { getPlayer } from "@/lib/repository";
import { rewardStatus } from "@/lib/reward-engine";
import { requireRunningToadsGate } from "@/lib/token-gate";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet")?.trim();
  if (!wallet) {
    return NextResponse.json({ error: "wallet required" }, { status: 400 });
  }

  const gateResult = await requireRunningToadsGate(wallet);
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
}
