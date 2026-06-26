import { getLedger, saveLedger } from "./repository";
import { awardToadXp, currentWeekId, PlayerState, Toad } from "./store";
import { RARITY_CYCLE_MS } from "./constants";

export interface JumpSettlement {
  settled: boolean;
  jumps: number;
  score: number;
  activeFrogs: number;
  nextJumpAt: number;
}

function tokenBoostMultiplier(balance: number): number {
  if (balance >= 10_000) return 1.5;
  if (balance >= 1_000)  return 1.3;
  if (balance >= 100)    return 1.15;
  if (balance >= 1)      return 1.05;
  return 1.0;
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function jumpIntervalForToad(toad: Toad): number {
  return RARITY_CYCLE_MS[toad.rarity] ?? 45_000;
}

function toadJumpScorePerJump(toad: Toad): number {
  return Math.max(1, Math.round(
    (toad.speed * 0.35 + toad.stamina * 0.25 + toad.luck * 0.20 + toad.consistency * 0.20) / 10
    + (toad.level - 1) * 1.5
  ));
}

export async function settleAutoJump(state: PlayerState, now = Date.now()): Promise<JumpSettlement> {
  if (!state.initialized) {
    return { settled: false, jumps: 0, score: 0, activeFrogs: 0, nextJumpAt: now };
  }

  const today = todayKey();
  if (state.dailyJumpDay !== today) {
    state.dailyJumpDay = today;
    state.dailyJumpScore = 0;
    state.dailyJumpCount = 0;
  }

  const weekId = currentWeekId();
  if (state.lastActiveSeasonId !== weekId) {
    state.lastActiveSeasonId = weekId;
    state.seasonJumpScore = 0;
    state.seasonJumpCount = 0;
  }

  const boost = tokenBoostMultiplier(state.tokenBalance);
  let totalJumps = 0;
  let totalScore = 0;
  let nextJumpAt = now + 45_000;

  for (const toad of state.toads) {
    if (!toad.active) continue;
    const anchor = toad.lastJumpAt || now;
    const interval = jumpIntervalForToad(toad);
    const jumps = Math.floor(Math.max(0, now - anchor) / interval);
    if (jumps > 0) {
      const score = Math.round(jumps * toadJumpScorePerJump(toad) * boost);
      toad.lastJumpAt = anchor + jumps * interval;
      toad.jumps = (toad.jumps ?? 0) + jumps;
      totalJumps += jumps;
      totalScore += score;
      awardToadXp(toad, jumps);
    }
    const next = (toad.lastJumpAt || anchor) + interval;
    if (next < nextJumpAt) nextJumpAt = next;
  }

  if (totalJumps > 0) {
    state.lastJumpSettledAt = now;
    state.dailyJumpCount += totalJumps;
    state.dailyJumpScore += totalScore;
    state.seasonJumpCount += totalJumps;
    state.seasonJumpScore += totalScore;
    state.lifetimeJumps += totalJumps;
    state.lifetimeJumpScore += totalScore;
    state.weeklyScore += totalScore;
    state.racePoints += totalScore;
    state.totalXp += totalJumps;

    const ledger = await getLedger();
    const isNewDay = ledger.dailyJumpDay !== today;
    if (isNewDay) {
      ledger.dailyJumpDay = today;
      ledger.dailyJumpScoreTotal = 0;
      // Daily 5% drip from dailyActivePool → racePool (automatic, no manual steps)
      const drip = Math.floor((ledger.dailyActivePool ?? 0) * 0.05);
      if (drip > 0) {
        ledger.racePool = (ledger.racePool ?? 0) + drip;
        ledger.dailyActivePool = Math.max(0, (ledger.dailyActivePool ?? 0) - drip);
      }
    }
    ledger.dailyJumpScoreTotal += totalScore;
    ledger.seasonJumpScoreTotal += totalScore;
    await saveLedger(ledger);
  }

  const activeFrogs = state.toads.filter(t => t.active).length;
  return { settled: totalJumps > 0, jumps: totalJumps, score: totalScore, activeFrogs, nextJumpAt };
}

export function estimateJumpShare(state: PlayerState, totalScore: number): number {
  if (totalScore <= 0 || state.dailyJumpScore <= 0) return 0;
  return state.dailyJumpScore / totalScore;
}
