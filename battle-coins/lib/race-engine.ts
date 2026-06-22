import { awardToadXp, currentWeekId, PlayerState, ProjectRewardsLedger, RaceEntrant, RaceEventRecord, selectedToad, Toad } from "./store";

export interface RaceResult {
  rank: number;
  won: boolean;
  points: number;
  xp: number;
  flyReward: number;
  playerScore: number;
  rivalScores: number[];
  toad: Toad;
}

// Unified scoring: 75% pure RNG (same for all frogs), 25% frog quality ceiling.
// Two-dice mental model: Dice 1 = pure chance, Dice 2 = your frog's upside.
function raceScore(speed: number, stamina: number, consistency: number, luck: number, level: number): number {
  const randomBase  = Math.random() * 75;
  const luckBonus   = (luck / 100) * Math.random() * 15;
  const levelBonus  = Math.min((level - 1) * 1.0, 12);
  const statBonus   = speed * 0.025 + stamina * 0.02 + consistency * 0.015;
  return randomBase + luckBonus + levelBonus + statBonus;
}

// Seeded LCG for reproducible NPC scores per race window
function seededRand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

const NPC_ARCHETYPES = [
  { name: "Ribbit McGee",  speed: 55, stamina: 55, consistency: 60, luck: 50, level: 2 },
  { name: "Croaksworth",   speed: 55, stamina: 48, consistency: 58, luck: 75, level: 1 },
  { name: "Baron von Hop", speed: 65, stamina: 65, consistency: 65, luck: 40, level: 5 },
] as const;

function scoreToad(toad: Toad): number {
  return raceScore(toad.speed, toad.stamina, toad.consistency, toad.luck, toad.level);
}

function rivalScores(): number[] {
  return NPC_ARCHETYPES.map((npc) =>
    raceScore(npc.speed, npc.stamina, npc.consistency, npc.luck, npc.level)
  );
}

function scoreEntrant(snapshot: RaceEntrant["toadSnapshot"]): number {
  return raceScore(snapshot.speed, snapshot.stamina, snapshot.consistency, snapshot.luck, snapshot.level);
}

export function resolveRaceEvent(
  event: RaceEventRecord,
  ledger: ProjectRewardsLedger
): RaceEventRecord {
  if (event.resolved) return event;

  const prizePool = Math.min(ledger.racePool, 50);
  const PRIZE_SHARES = [0.40, 0.25, 0.15];

  // Score real entrants
  const scored: Array<{ wallet: string; score: number; isBot: boolean; botName?: string }> = event.entrants.map((e) => ({
    wallet: e.wallet,
    score: scoreEntrant(e.toadSnapshot),
    isBot: false,
  }));

  // Fill to 4 with seeded NPCs so all players see the same bot scores for this window
  if (scored.length < 4) {
    const rand = seededRand(event.windowId ^ 0xDEADBEEF);
    const npcCount = 4 - scored.length;
    for (let i = 0; i < npcCount; i++) {
      const npc = NPC_ARCHETYPES[i % NPC_ARCHETYPES.length];
      // Re-implement raceScore using seeded rand
      const npcScore =
        rand() * 75 +
        (npc.luck / 100) * rand() * 15 +
        Math.min((npc.level - 1) * 1.0, 12) +
        npc.speed * 0.025 + npc.stamina * 0.02 + npc.consistency * 0.015;
      scored.push({ wallet: `npc:${i}`, score: npcScore, isBot: true, botName: npc.name });
    }
  }

  scored.sort((a, b) => b.score - a.score);

  let totalHumanTokensAwarded = 0;
  const results = scored.map((entry, idx) => {
    const rank = idx + 1;
    const share = PRIZE_SHARES[idx] ?? 0;
    const rawTokens = rank <= 3 ? parseFloat((prizePool * share).toFixed(6)) : 0;
    const fliesAwarded = rank <= 3 ? 0 : 2;

    if (entry.isBot) {
      // NPC prize rolls back to pool — handled after the loop
      return {
        wallet: entry.wallet,
        rank,
        score: Math.round(entry.score),
        tokensAwarded: rawTokens,  // stored for rollback calculation
        fliesAwarded: 0,
        isBot: true,
        botName: entry.botName,
      };
    }

    totalHumanTokensAwarded += rawTokens;
    return {
      wallet: entry.wallet,
      rank,
      score: Math.round(entry.score),
      tokensAwarded: rawTokens,
      fliesAwarded,
      isBot: false,
    };
  });

  // Roll back NPC prizes to the pool
  for (const result of results) {
    if (result.isBot && result.tokensAwarded > 0) {
      ledger.racePool += result.tokensAwarded;  // stays in ecosystem
      result.tokensAwarded = 0;                  // NPC keeps nothing
    }
  }

  ledger.racePool = Math.max(0, ledger.racePool - totalHumanTokensAwarded);
  ledger.totalRacePrizesPaid += totalHumanTokensAwarded;

  event.resolved = true;
  event.results = results;
  return event;
}

export function enterRace(state: PlayerState): RaceResult {
  const toad = selectedToad(state);
  if (!toad) throw new Error("No toad selected");

  const playerScore = scoreToad(toad);
  const rivals = rivalScores();
  const rank = 1 + rivals.filter((score) => score > playerScore).length;
  const won = rank === 1;
  const points = rank === 1 ? 12 : rank === 2 ? 7 : rank === 3 ? 4 : 2;
  const xp = won ? 14 : 8;
  const flyReward = won ? (toad.kind === "shadow" && Math.random() < 0.35 ? 3 : 2) : rank === 2 ? 1 : 0;
  const today = new Date().toISOString().slice(0, 10);
  if (state.dailyJumpDay !== today) {
    state.dailyJumpDay = today;
    state.dailyJumpScore = 0;
    state.dailyJumpCount = 0;
  }

  state.totalRaces += 1;
  const weekId = currentWeekId();
  state.currentWeekId = weekId;
  state.racePoints += points;
  state.weeklyScore += points;
  state.dailyJumpScore += points;
  state.dailyJumpCount += 1;
  state.seasonJumpScore += points;
  state.seasonJumpCount += 1;
  state.lifetimeJumps += 1;
  state.lifetimeJumpScore += points;
  state.weeklyRaces += 1;
  const weeklySnapshot = state.weeklyHistory[weekId] ?? { score: 0, wins: 0, races: 0 };
  weeklySnapshot.score += points;
  weeklySnapshot.races += 1;
  state.totalXp += xp;
  state.flies += flyReward;
  if (won) {
    state.wins += 1;
    state.weeklyWins += 1;
    weeklySnapshot.wins += 1;
  } else {
    state.losses += 1;
  }
  state.weeklyHistory[weekId] = weeklySnapshot;
  awardToadXp(toad, xp);

  return {
    rank,
    won,
    points,
    xp,
    flyReward,
    playerScore: Math.round(playerScore),
    rivalScores: rivals.map((score) => Math.round(score)),
    toad,
  };
}
