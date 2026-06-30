import { toadJumpConfig } from "./config";
import { withPostgresAdvisoryLock } from "./db";
import { resolveRaceEvent } from "./race-engine";
import {
  getLedger,
  getPlayer,
  getRaceEvent,
  invalidateMetaCache,
  saveLedger,
  savePlayer,
  saveRaceEvent,
} from "./repository";
import { payRacePrize } from "./reward-engine";

export interface RaceSettlementResult {
  settled: number[];
  cancelled: number[];
  checkedAt: number;
}

export async function settleRaceWindows(lookbackWindows = 6): Promise<RaceSettlementResult> {
  return withPostgresAdvisoryLock("races:settlement", async () => {
    const now = Date.now();
    const currentWindowId = Math.floor(now / 1_800_000);
    const settled: number[] = [];
    const cancelled: number[] = [];

    for (let w = currentWindowId - 1; w >= currentWindowId - lookbackWindows; w--) {
      const event = await getRaceEvent(w);
      if (!event || event.resolved) continue;

      const endsAt = (w + 1) * 1_800_000;
      if (now < endsAt) continue;

      if (event.entrants.length < 3) {
        event.resolved = true;
        event.results = [];
        await saveRaceEvent(event);

        for (const entrant of event.entrants) {
          const player = await getPlayer(entrant.wallet);
          player.flies += 2;
          player.lastRaceWindowId = 0;
          player.lastRaceResult = {
            rank: 0,
            score: 0,
            tokensAwarded: 0,
            fliesAwarded: 2,
            cancelled: true,
          };
          await savePlayer(player);
        }
        cancelled.push(w);
        continue;
      }

      const ledger = await getLedger();
      resolveRaceEvent(event, ledger);
      await saveRaceEvent(event);

      for (const result of event.results ?? []) {
        if (result.isBot) continue;

        const player = await getPlayer(result.wallet);
        const entrant = event.entrants.find((entry) => entry.wallet === result.wallet);

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

    if (settled.length || cancelled.length) {
      await invalidateMetaCache();
    }

    return { settled, cancelled, checkedAt: now };
  });
}

export function assertCronAuth(auth: string | null): Response | null {
  if (toadJumpConfig.isProduction && !toadJumpConfig.cronSecret) {
    return Response.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  }
  if (toadJumpConfig.cronSecret && auth !== `Bearer ${toadJumpConfig.cronSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
