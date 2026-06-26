import { NextRequest, NextResponse } from "next/server";
import { getLedger, getPlayer, getRaceEvent, invalidateMetaCache, saveLedger, savePlayer, saveRaceEvent } from "@/lib/repository";
import { resolveRaceEvent } from "@/lib/race-engine";
import { payRacePrize } from "@/lib/reward-engine";
import { toadJumpConfig } from "@/lib/config";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (toadJumpConfig.cronSecret && auth !== `Bearer ${toadJumpConfig.cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  const currentWindowId = Math.floor(now / 1_800_000);
  const settled: number[] = [];
  const cancelled: number[] = [];

  // Check last 6 windows (3 hours back) for unsettled races
  for (let w = currentWindowId - 1; w >= currentWindowId - 6; w--) {
    const event = await getRaceEvent(w);
    if (!event) continue;
    if (event.resolved) continue;

    const endsAt = (w + 1) * 1_800_000;
    if (now < endsAt) continue; // window still open

    // Cancel if fewer than 3 entrants
    if (event.entrants.length < 3) {
      event.resolved = true;
      event.results = [];
      await saveRaceEvent(event);

      for (const entrant of event.entrants) {
        const player = await getPlayer(entrant.wallet);
        player.flies += 2;
        player.lastRaceWindowId = 0;
        player.lastRaceResult = {
          rank: 0, score: 0, tokensAwarded: 0, fliesAwarded: 2, cancelled: true,
        };
        await savePlayer(player);
      }
      cancelled.push(w);
      continue;
    }

    // Resolve and pay all entrants
    const ledger = await getLedger();
    resolveRaceEvent(event, ledger);
    await saveRaceEvent(event);

    for (const result of (event.results ?? [])) {
      if (result.isBot) continue;

      const player = await getPlayer(result.wallet);
      const entrant = event.entrants.find((e) => e.wallet === result.wallet);

      player.lastRaceResult = {
        rank: result.rank,
        score: result.score,
        tokensAwarded: result.tokensAwarded,
        fliesAwarded: result.fliesAwarded,
        toadName: entrant?.toadSnapshot.name,
      };

      player.raceHistory = [
        {
          rank: result.rank,
          score: result.score,
          tokensAwarded: result.tokensAwarded,
          fliesAwarded: result.fliesAwarded,
          toadName: entrant?.toadSnapshot.name ?? "",
          windowId: event.windowId,
          timestamp: now,
        },
        ...(player.raceHistory ?? []),
      ].slice(0, 20);

      if (result.rank <= 3) {
        player.wins = (player.wins ?? 0) + (result.rank === 1 ? 1 : 0);
        player.losses = (player.losses ?? 0) + (result.rank === 1 ? 0 : 1);
        player.racePoints = (player.racePoints ?? 0) + (result.rank === 1 ? 12 : result.rank === 2 ? 7 : 4);
      } else {
        player.losses = (player.losses ?? 0) + 1;
        player.racePoints = (player.racePoints ?? 0) + 2;
      }
      player.totalRaces = (player.totalRaces ?? 0) + 1;
      player.lastRaceWindowId = 0;

      if (result.tokensAwarded > 0) {
        const tx = await payRacePrize(result.wallet, result.tokensAwarded, ledger);
        if (!tx) {
          // Transfer failed — give flies as fallback
          const flyFallback = result.rank === 1 ? 4 : result.rank === 2 ? 2 : 1;
          player.flies += flyFallback;
          if (player.lastRaceResult) {
            player.lastRaceResult.tokensAwarded = 0;
            player.lastRaceResult.fliesAwarded = flyFallback;
          }
        }
      } else if (result.fliesAwarded > 0) {
        player.flies += result.fliesAwarded;
      }

      await savePlayer(player);
    }

    await saveLedger(ledger);
    settled.push(w);
  }

  await invalidateMetaCache();
  return NextResponse.json({ settled, cancelled, checkedAt: now });
}
