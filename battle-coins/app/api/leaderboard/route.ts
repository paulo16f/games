import { NextResponse } from "next/server";
import { store } from "@/lib/store";
import { STAR_MULTIPLIERS } from "@/lib/constants";

export const dynamic = "force-dynamic";

function effectivePower(f: { basePower: number; stars: number }): number {
  return f.basePower * STAR_MULTIPLIERS[Math.min(f.stars - 1, 4)];
}

export async function GET() {
  const entries = [...store.entries()]
    .filter(([, state]) => state.arenaRating !== undefined)
    .map(([wallet, state]) => {
      const topFighter = state.fighters.length
        ? state.fighters.reduce((best, f) =>
            effectivePower(f) > effectivePower(best) ? f : best)
        : null;
      return {
        wallet,
        arenaRating: state.arenaRating ?? 100,
        topFighter,
        totalKills: state.totalKills,
        totalPulls: state.totalPulls,
      };
    })
    .sort((a, b) => b.arenaRating - a.arenaRating)
    .slice(0, 10);

  return NextResponse.json(entries);
}
