import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { listPlayers } from "@/lib/repository";
import { publicWallet } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const players = (await listPlayers()).filter((state) => state.initialized);
    const entries = players
    .map((state) => {
      const activeFrogs = state.toads.filter(t => t.active).length;
      const topToad = [...state.toads].sort((a, b) => b.level - a.level)[0] ?? null;
      return {
        wallet: publicWallet(state.wallet),
        nickname: state.nickname || publicWallet(state.wallet),
        dailyJumpScore: state.dailyJumpScore,
        seasonJumpScore: state.seasonJumpScore,
        lifetimeJumps: state.lifetimeJumps,
        racePoints: state.racePoints,
        activeFrogs,
        totalFrogs: state.toads.length,
        tokenBalance: state.tokenBalance,
        topToad: topToad ? {
          name: topToad.name,
          level: topToad.level,
          rarity: topToad.rarity,
          active: topToad.active,
        } : null,
      };
    })
    .sort((a, b) => b.dailyJumpScore - a.dailyJumpScore)
    .slice(0, 20);

    return NextResponse.json(entries);
  } catch (error) {
    return apiError(error);
  }
}
