import { toadJumpConfig } from "./config";
import { getLedger, saveLedger } from "./repository";
import { awardToadXp, currentWeekId, PlayerState, Toad } from "./store";

export interface JumpSettlement {
  settled: boolean;
  jumps: number;
  score: number;
  activeFrogs: number;
  nextJumpAt: number;
}

const JUMP_SPEED: Record<string, number> = {
  swamp:   1,
  poison:  1.35,
  crystal: 0.9,
  shadow:  1,
  emperor: 1.65,
};

function tokenBoostMultiplier(balance: number): number {
  if (balance >= 10_000) return 3.0;
  if (balance >= 1_000)  return 2.0;
  if (balance >= 100)    return 1.5;
  if (balance >= 1)      return 1.2;
  return 1.0;
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function jumpIntervalForToad(toad: Toad): number {
  const speed = JUMP_SPEED[toad.kind] ?? 1;
  return Math.max(60_000, Math.floor(toadJumpConfig.autoJumpIntervalMs / speed));
}

function toadJumpScorePerJump(toad: Toad): number {
  const base =
    toad.speed * 0.34 +
    toad.stamina * 0.24 +
    toad.consistency * 0.24 +
    toad.luck * 0.08 +
    toad.level * 2;
  return Math.max(1, Math.round(base / 10));
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
  let nextJumpAt = now + toadJumpConfig.autoJumpIntervalMs;

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
    state.flies += Math.floor(totalJumps / 25);
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
    if (ledger.dailyJumpDay !== today) {
      ledger.dailyJumpDay = today;
      ledger.dailyJumpScoreTotal = 0;
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
