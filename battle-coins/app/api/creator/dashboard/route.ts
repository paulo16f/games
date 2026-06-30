import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { creatorKeyConfigured, hasCreatorKey } from "@/lib/creator-auth";
import { getLedger, getRewardLedger, listPlayers } from "@/lib/repository";

export const dynamic = "force-dynamic";

function hasCreatorAccess(req: Request): boolean {
  return hasCreatorKey(req.headers.get("x-creator-key"));
}

export async function GET(req: Request) {
  if (!creatorKeyConfigured()) {
    return NextResponse.json({ error: "Creator dashboard key is not configured" }, { status: 503 });
  }
  if (!hasCreatorAccess(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const players = (await listPlayers()).filter((player) => player.initialized);
    const ledger = await getLedger();
    const rewardLedger = await getRewardLedger();
    return NextResponse.json({
      ledger,
      rewardLedger,
      activeJumpersToday: players.filter((player) => player.dailyJumpScore > 0).length,
      totalDailyJumpScore: players.reduce((sum, player) => sum + player.dailyJumpScore, 0),
      totalSeasonJumpScore: players.reduce((sum, player) => sum + player.seasonJumpScore, 0),
      topJumpers: players
        .sort((a, b) => b.seasonJumpScore - a.seasonJumpScore)
        .slice(0, 10)
        .map((player) => ({
          wallet: `${player.wallet.slice(0, 4)}...${player.wallet.slice(-4)}`,
          dailyJumpScore: player.dailyJumpScore,
          seasonJumpScore: player.seasonJumpScore,
          lifetimeJumps: player.lifetimeJumps,
        })),
    });
  } catch (error) {
    return apiError(error);
  }
}
