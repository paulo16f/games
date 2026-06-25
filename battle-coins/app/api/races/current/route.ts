import { NextResponse } from "next/server";
import { getPlayer, getRaceEvent } from "@/lib/repository";
import { publicWallet } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const windowId = Math.floor(Date.now() / 1_800_000);
  const event = await getRaceEvent(windowId);
  const entrants = await Promise.all(
    (event?.entrants ?? []).map(async (e) => {
      const player = await getPlayer(e.wallet);
      return {
        name: player.nickname || publicWallet(e.wallet),
        toadName: e.toadSnapshot.name,
        toadRarity: e.toadSnapshot.rarity,
        toadLevel: e.toadSnapshot.level,
      };
    })
  );
  return NextResponse.json({
    windowId,
    endsAt: (windowId + 1) * 1_800_000,
    entrantCount: entrants.length,
    entrants,
  });
}
