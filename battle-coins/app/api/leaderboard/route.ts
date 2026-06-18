import { NextResponse } from "next/server";
import { store } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const entries = [...store.entries()]
    .map(([wallet, state]) => ({
      wallet,
      totalKills: state.totalKills,
      totalPulls: state.totalPulls,
      weapon: state.weapon,
      chest: state.chest,
      atk: state.atk,
      def: state.def,
    }))
    .sort((a, b) => b.totalKills - a.totalKills)
    .slice(0, 10);

  return NextResponse.json(entries);
}
