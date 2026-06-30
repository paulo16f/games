import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { getLedger, getRewardLedger, listPlayers } from "@/lib/repository";
import { currentWeekId, previousWeekId } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const players = (await listPlayers()).filter((state) => state.initialized);
    const current = currentWeekId();
    const ledger = await getLedger();
    const rewardLedger = await getRewardLedger();
    return NextResponse.json({
    activePlayers: players.length,
    totalRaces: players.reduce((sum, state) => sum + state.totalRaces, 0),
    totalJumps: players.reduce((sum, state) => sum + state.lifetimeJumps, 0),
    dailyJumpScore: players.reduce((sum, state) => sum + state.dailyJumpScore, 0),
    seasonJumpScore: players.reduce((sum, state) => sum + state.seasonJumpScore, 0),
    currentWeekId: current,
    claimableWeekId: previousWeekId(),
    weeklyScores: players.reduce((sum, state) => sum + (state.weeklyHistory[current]?.score ?? 0), 0),
    totalFlies: players.reduce((sum, state) => sum + state.flies, 0),
    projectLedger: {
      dailyActivePool: ledger.dailyActivePool,
      racePool: ledger.racePool,
    },
    rewardLedger: {
      dailyPoolRemaining: rewardLedger.dailyPoolRemaining,
      dailyClaimCount: rewardLedger.dailyClaimCount,
      totalTokenRewardsPaid: rewardLedger.totalTokenRewardsPaid,
      failedPayouts: rewardLedger.failedPayouts,
    },
    });
  } catch (error) {
    return apiError(error);
  }
}
