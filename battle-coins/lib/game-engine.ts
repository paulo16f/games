import { ACTION_COSTS } from "./constants";
import { toadJumpConfig } from "./config";
import { openEgg } from "./gacha-engine";
import { settleAutoJump } from "./idle-engine";
import { getLedger, getRaceEvent, saveRaceEvent, saveLedger } from "./repository";
import { enterRace, resolveRaceEvent } from "./race-engine";
import { claim24hReward, payRacePrize } from "./reward-engine";
import {
  awardToadXp,
  initializePlayer,
  PlayerState,
} from "./store";
import { TokenGateResult } from "./token-gate";

export type GameAction =
  | "init"
  | "claim_24h_reward"
  | "claim_daily_flies"
  | "claim_flies_skip"
  | "settle_jumps"
  | "enter_race"
  | "enter_race_event"
  | "open_egg"
  | "activate_toad"
  | "deactivate_toad"
  | "select_toad"
  | "record_creator_rewards"
  | "claim_weekly_rewards"
  | "feed_toad";

export interface GameActionInput {
  action: GameAction;
  toadId?: string;
  amount?: number;
  creatorKey?: string;
}

export class GameActionError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "GameActionError";
    this.status = status;
  }
}

function ensureInitialized(state: PlayerState, gate: TokenGateResult): void {
  initializePlayer(state, gate.balance);
}

async function maybeFinalizeRace(state: PlayerState): Promise<void> {
  if (!state.lastRaceWindowId) return;
  const event = await getRaceEvent(state.lastRaceWindowId);
  if (!event || event.resolved || Date.now() < event.endsAt) return;

  // Cancel and refund if fewer than 3 real players entered
  if (event.entrants.length < 3) {
    state.flies += 2;
    state.lastRaceWindowId = 0;
    state.lastRaceResult = { rank: 0, score: 0, tokensAwarded: 0, fliesAwarded: 2, cancelled: true };
    return;
  }

  const ledger = await getLedger();
  const resolved = resolveRaceEvent(event, ledger);
  await saveRaceEvent(resolved);
  await saveLedger(ledger);

  const myEntrant = resolved.entrants.find((e) => e.wallet === state.wallet);
  const myResult = resolved.results?.find((r) => r.wallet === state.wallet);
  if (myResult) {
    state.lastRaceResult = {
      rank: myResult.rank,
      score: myResult.score,
      tokensAwarded: myResult.tokensAwarded,
      fliesAwarded: myResult.fliesAwarded,
      toadName: myEntrant?.toadSnapshot.name,
    };
    state.raceHistory = [
      {
        rank: myResult.rank,
        score: myResult.score,
        tokensAwarded: myResult.tokensAwarded,
        fliesAwarded: myResult.fliesAwarded,
        toadName: myEntrant?.toadSnapshot.name ?? "",
        windowId: event.windowId,
        timestamp: Date.now(),
      },
      ...(state.raceHistory ?? []),
    ].slice(0, 20);
    if (myResult.tokensAwarded > 0) {
      const tx = await payRacePrize(state.wallet, myResult.tokensAwarded, ledger);
      if (!tx) {
        // Token prize below minimum or transfer failed — give flies instead
        const flyFallback = myResult.rank === 1 ? 4 : myResult.rank === 2 ? 2 : 1;
        state.flies += flyFallback;
        if (state.lastRaceResult) {
          state.lastRaceResult.tokensAwarded = 0;
          state.lastRaceResult.fliesAwarded = flyFallback;
        }
        if (state.raceHistory.length > 0) {
          state.raceHistory[0].tokensAwarded = 0;
          state.raceHistory[0].fliesAwarded = flyFallback;
        }
      }
    } else if (myResult.fliesAwarded > 0) {
      state.flies += myResult.fliesAwarded;
    }
  }
  state.lastRaceWindowId = 0;
}

export async function handleGameAction(
  state: PlayerState,
  gate: TokenGateResult,
  input: GameActionInput
): Promise<Record<string, unknown>> {
  if (input.action !== "init" && input.action !== "record_creator_rewards") {
    ensureInitialized(state, gate);
    await settleAutoJump(state);
    await maybeFinalizeRace(state);
  }

  switch (input.action) {
    case "init": {
      initializePlayer(state, gate.balance);
      const jumps = await settleAutoJump(state);
      return { initialized: true, starterFlies: state.flies, jumps };
    }

    case "settle_jumps": {
      return { jumps: await settleAutoJump(state) };
    }

    case "record_creator_rewards": {
      if (!toadJumpConfig.creatorDashboardKey) throw new GameActionError("Creator dashboard key is not configured", 503);
      if (input.creatorKey !== toadJumpConfig.creatorDashboardKey) throw new GameActionError("Invalid creator dashboard key", 403);
      const amount = Number(input.amount);
      if (!Number.isFinite(amount) || amount <= 0) throw new GameActionError("amount must be a positive number");
      const ledger = await getLedger();
      ledger.creatorRewardsRecorded += amount;
      ledger.dailyActivePool += amount;
      ledger.holderRewardsPool += amount;
      ledger.totalReturnedToProject += amount;
      return { creatorRewards: await saveLedger(ledger) };
    }

    case "claim_24h_reward": {
      try {
        return { reward: await claim24hReward(state, gate) };
      } catch (error) {
        throw new GameActionError(error instanceof Error ? error.message : "Unable to claim 24h reward");
      }
    }

    case "claim_daily_flies": {
      const COOLDOWN = 30 * 60 * 1000;
      if (state.lastFlyClaimAt && Date.now() - state.lastFlyClaimAt < COOLDOWN)
        throw new GameActionError("Flies on cooldown — wait 30 minutes");
      state.lastFlyClaimAt = Date.now();
      state.flies += 5;
      return { fliesAwarded: 5 };
    }

    case "claim_flies_skip": {
      if ((state.tokenBalance ?? 0) < 1) throw new GameActionError("Need 1+ tokens to skip cooldown");
      state.flies += 5;
      state.lastFlyClaimAt = Date.now();
      return { fliesAwarded: 5 };
    }

    case "select_toad": {
      const toad = state.toads.find((entry) => entry.id === input.toadId);
      if (!toad) throw new GameActionError("Toad not found", 404);
      state.selectedToadId = toad.id;
      return { selectedToadId: toad.id };
    }

    case "activate_toad": {
      const toad = state.toads.find(t => t.id === input.toadId);
      if (!toad) throw new GameActionError("Toad not found", 404);
      if (toad.active) throw new GameActionError(`${toad.name} is already jumping`);
      toad.active = true;
      toad.lastJumpAt = Date.now();
      return { activated: true, toadId: toad.id, toadName: toad.name };
    }

    case "deactivate_toad": {
      const toad = state.toads.find(t => t.id === input.toadId);
      if (!toad) throw new GameActionError("Toad not found", 404);
      toad.active = false;
      return { deactivated: true, toadId: toad.id };
    }

    case "open_egg": {
      try {
        return { egg: openEgg(state) };
      } catch (error) {
        throw new GameActionError(error instanceof Error ? error.message : "Unable to open egg");
      }
    }

    case "enter_race": {
      const sprintCost = ACTION_COSTS.sprint;
      if (state.flies < sprintCost) throw new GameActionError(`Need ${sprintCost} flies to sprint`);
      state.flies -= sprintCost;
      try {
        return { race: enterRace(state) };
      } catch (error) {
        state.flies += sprintCost;
        throw new GameActionError(error instanceof Error ? error.message : "Unable to enter race");
      }
    }

    case "enter_race_event": {
      if (state.flies < 2) throw new GameActionError("Need 2 flies to enter the race");
      const activeToad = input.toadId
        ? state.toads.find((t) => t.id === input.toadId)
        : state.toads.find((t) => t.active);
      if (!activeToad) throw new GameActionError("No frog found to race — pick a frog first");
      const windowId = Math.floor(Date.now() / 1_800_000);
      if (state.lastRaceWindowId === windowId) throw new GameActionError("Already entered this race window");
      const endsAt = (windowId + 1) * 1_800_000;
      if (Date.now() >= endsAt - 60_000) throw new GameActionError("Race window is closing — wait for the next one");
      state.flies -= 2;
      state.lastRaceWindowId = windowId;
      const existing = await getRaceEvent(windowId);
      const event = existing ?? {
        windowId,
        startsAt: windowId * 1_800_000,
        endsAt,
        entrants: [],
        resolved: false,
      };
      event.entrants.push({
        wallet: state.wallet,
        toadSnapshot: {
          id: activeToad.id,
          name: activeToad.name,
          kind: activeToad.kind,
          rarity: activeToad.rarity,
          speed: activeToad.speed,
          stamina: activeToad.stamina,
          luck: activeToad.luck,
          consistency: activeToad.consistency,
          level: activeToad.level,
        },
        enteredAt: Date.now(),
      });
      await saveRaceEvent(event);
      return { windowId, endsAt, entrantCount: event.entrants.length };
    }

    case "claim_weekly_rewards": {
      ensureInitialized(state, gate);
      throw new GameActionError("Weekly token prize pool is coming in v2", 403);
    }

    case "feed_toad": {
      const toad = state.toads.find(t => t.id === input.toadId);
      if (!toad) throw new GameActionError("Toad not found", 404);
      const cost = ACTION_COSTS.feedToad;
      if (state.flies < cost) throw new GameActionError(`Need ${cost} flies to feed`);
      state.flies -= cost;
      const xpGained = 25 + Math.floor(toad.level * 5);
      const levelBefore = toad.level;
      awardToadXp(toad, xpGained);
      const leveled = toad.level > levelBefore;
      // Micro-contribution to race pool: every feed fuels the prize pot
      const ledger = await getLedger();
      ledger.racePool = Math.max(0, (ledger.racePool ?? 0) + 0.5);
      await saveLedger(ledger);
      return { fed: true, toadId: toad.id, toadName: toad.name, xpGained, level: toad.level, leveled };
    }

    default:
      throw new GameActionError("Unknown action");
  }
}

export function isGameAction(value: unknown): value is GameAction {
  return (
    value === "init" ||
    value === "claim_24h_reward" ||
    value === "claim_daily_flies" ||
    value === "claim_flies_skip" ||
    value === "settle_jumps" ||
    value === "enter_race" ||
    value === "enter_race_event" ||
    value === "open_egg" ||
    value === "activate_toad" ||
    value === "deactivate_toad" ||
    value === "select_toad" ||
    value === "record_creator_rewards" ||
    value === "claim_weekly_rewards" ||
    value === "feed_toad"
  );
}
