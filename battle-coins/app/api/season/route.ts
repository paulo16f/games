import { NextResponse } from "next/server";
import { settleAutoJump } from "@/lib/idle-engine";
import { getLedger, getRewardLedger, listPlayers, savePlayer } from "@/lib/repository";
import { currentWeekId, previousWeekId } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const players = (await listPlayers()).filter((state) => state.initialized);
  await Promise.all(players.map(async (state) => {
    await settleAutoJump(state);
    await savePlayer(state);
  }));
  const current = currentWeekId();
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
    projectLedger: await getLedger(),
    rewardLedger: await getRewardLedger(),
  });
}
