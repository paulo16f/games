import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { getLedger, getMetaCache, getRewardLedger, listPlayers, saveMetaCache } from "@/lib/repository";
import { settleRaceWindows } from "@/lib/race-settlement";
import { currentWeekId, previousWeekId, publicWallet } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await settleRaceWindows();

    const cached = await getMetaCache();
    if (cached) return NextResponse.json(cached);

    const players = (await listPlayers()).filter((p) => p.initialized);
    const ledger = await getLedger();
    const rewardLedger = await getRewardLedger();
    const current = currentWeekId();

    const leaderboard = players
    .map((state) => {
      const topToad = [...state.toads].sort((a, b) => b.level - a.level)[0] ?? null;
      return {
        wallet: publicWallet(state.wallet),
        nickname: state.nickname || publicWallet(state.wallet),
        dailyJumpScore: state.dailyJumpScore,
        seasonJumpScore: state.seasonJumpScore,
        lifetimeJumps: state.lifetimeJumps,
        racePoints: state.racePoints,
        activeFrogs: state.toads.filter((t) => t.active).length,
        totalFrogs: state.toads.length,
        tokenBalance: state.tokenBalance,
        topToad: topToad
          ? { name: topToad.name, level: topToad.level, rarity: topToad.rarity, active: topToad.active }
          : null,
      };
    })
    .sort((a, b) => b.dailyJumpScore - a.dailyJumpScore)
    .slice(0, 20);

    const season = {
    activePlayers: players.length,
    totalRaces: players.reduce((sum, p) => sum + p.totalRaces, 0),
    totalJumps: players.reduce((sum, p) => sum + p.lifetimeJumps, 0),
    dailyJumpScore: players.reduce((sum, p) => sum + p.dailyJumpScore, 0),
    seasonJumpScore: players.reduce((sum, p) => sum + p.seasonJumpScore, 0),
    currentWeekId: current,
    claimableWeekId: previousWeekId(),
    weeklyScores: players.reduce((sum, p) => sum + (p.weeklyHistory[current]?.score ?? 0), 0),
    totalFlies: players.reduce((sum, p) => sum + p.flies, 0),
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
  };

    const snapshot = { leaderboard, season };
    await saveMetaCache(snapshot);
    return NextResponse.json(snapshot);
  } catch (error) {
    return apiError(error);
  }
}
