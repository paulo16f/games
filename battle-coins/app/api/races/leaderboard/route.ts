import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { listPlayers } from "@/lib/repository";
import { publicWallet } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const players = (await listPlayers()).filter((p) => p.initialized && p.totalRaces > 0);
    const entries = players
    .map((p) => ({
      wallet: publicWallet(p.wallet),
      nickname: p.nickname || publicWallet(p.wallet),
      wins: p.wins,
      totalRaces: p.totalRaces,
      racePoints: p.racePoints,
    }))
    .sort((a, b) => b.wins - a.wins)
    .slice(0, 20);
    return NextResponse.json(entries);
  } catch (error) {
    return apiError(error);
  }
}
