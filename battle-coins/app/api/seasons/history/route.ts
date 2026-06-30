import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { listPlayers } from "@/lib/repository";
import { currentWeekId } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
    const players = (await listPlayers()).filter((player) => player.initialized);
    const current = currentWeekId();
    const seasons = new Map<string, {
      seasonId: string;
      totalScore: number;
      totalJumps: number;
      topPlayers: Array<{ wallet: string; score: number; jumps: number; bestFrog: string }>;
    }>();

    for (const player of players) {
      for (const snapshot of Object.values(player.seasonHistory ?? {})) {
        const season = seasons.get(snapshot.seasonId) ?? {
          seasonId: snapshot.seasonId,
          totalScore: 0,
          totalJumps: 0,
          topPlayers: [],
        };
        season.totalScore += snapshot.score;
        season.totalJumps += snapshot.jumps;
        season.topPlayers.push({
          wallet: `${player.wallet.slice(0, 4)}...${player.wallet.slice(-4)}`,
          score: snapshot.score,
          jumps: snapshot.jumps,
          bestFrog: snapshot.bestFrog,
        });
        seasons.set(snapshot.seasonId, season);
      }
    }

    const history = [...seasons.values()].map((season) => ({
      ...season,
      topPlayers: season.topPlayers.sort((a, b) => b.score - a.score).slice(0, 10),
    })).sort((a, b) => b.seasonId.localeCompare(a.seasonId));

    const player = session ? players.find((entry) => entry.wallet === session.wallet) : null;
    return NextResponse.json({
      currentSeasonId: current,
      history,
      playerHistory: player ? Object.values(player.seasonHistory ?? {}).sort((a, b) => b.seasonId.localeCompare(a.seasonId)) : [],
    });
  } catch (error) {
    return apiError(error);
  }
}
