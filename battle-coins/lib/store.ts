import { STARTER_FLIES, TOAD_DAILY_ENERGY, TOAD_TEMPLATES, ToadKind } from "./constants";

export interface Toad {
  id: string;
  kind: ToadKind;
  name: string;
  rarity: string;
  speed: number;
  stamina: number;
  luck: number;
  consistency: number;
  xp: number;
  level: number;
  skin: string;
  energy: number;
  maxEnergy: number;
  lastEnergyRefillDate: string;
  active: boolean;
  lastJumpAt: number;
  jumps: number;
}

export interface ProjectRewardsLedger {
  holderRewardsPool: number;
  seasonPrizePool: number;
  buybackBurnPool: number;
  developmentPool: number;
  totalReturnedToProject: number;
  externalAmount: number;
  creatorRewardsRecorded: number;
  dailyActivePool: number;
  seasonLeaderboardPool: number;
  reservePool: number;
  totalJumpRewardsPaid: number;
  dailyJumpScoreTotal: number;
  seasonJumpScoreTotal: number;
  dailyJumpDay: string;
  lastProcessedSignature: string;
  lastAutoSyncAt: number;
  autoSyncCount: number;
  totalTokensBurned: number;
  dailyTokensBurned: number;
  dailyBurnDay: string;
  racePool: number;
  totalRacePrizesPaid: number;
}

export interface RaceEntrant {
  wallet: string;
  toadSnapshot: Pick<Toad, "id" | "name" | "kind" | "rarity" | "speed" | "stamina" | "luck" | "consistency" | "level">;
  enteredAt: number;
}

export interface RaceEventRecord {
  windowId: number;
  startsAt: number;
  endsAt: number;
  entrants: RaceEntrant[];
  resolved: boolean;
  results?: Array<{ wallet: string; rank: number; score: number; tokensAwarded: number; fliesAwarded: number; isBot?: boolean; botName?: string }>;
}

export interface TokenRewardLedger {
  dailyPoolRemaining: number;
  dailyClaimCount: number;
  dailyClaimDay: string;
  totalTokenRewardsPaid: number;
  failedPayouts: number;
}

export interface TokenRewardClaim {
  id: string;
  wallet: string;
  claimPeriodId: string;
  status: "pending" | "paid" | "failed";
  amount: number;
  netAmount: number;
  burnedAmount: number;
  fliesGranted: number;
  holderBonus: number;
  txSignature: string | null;
  error: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface PlayerState {
  wallet: string;
  initialized: boolean;
  tokenBalance: number;
  flies: number;
  toads: Toad[];
  selectedToadId: string | null;
  totalRaces: number;
  wins: number;
  losses: number;
  racePoints: number;
  weeklyScore: number;
  weeklyWins: number;
  weeklyRaces: number;
  currentWeekId: string;
  weeklyHistory: Record<string, WeeklySnapshot>;
  lastWeeklyClaimId: string;
  weeklyRewardClaims: WeeklyRewardClaim[];
  totalXp: number;
  gachaPulls: number;
  lastDailyClaimDate: string;
  lastRewardClaimAt: number;
  nextRewardClaimAt: number;
  latestRewardClaimId: string;
  lastJumpSettledAt: number;
  dailyJumpScore: number;
  dailyJumpCount: number;
  dailyJumpDay: string;
  seasonJumpScore: number;
  seasonJumpCount: number;
  lifetimeJumps: number;
  lifetimeJumpScore: number;
  lastActiveSeasonId: string;
  seasonHistory: Record<string, SeasonPlayerSnapshot>;
  lastVerifiedAt: number;
  lastFlyClaimAt: number;
  lastRaceWindowId: number;
  lastRaceResult: { rank: number; score: number; tokensAwarded: number; fliesAwarded: number; toadName?: string } | null;
  createdAt: number;
  updatedAt: number;
}

export interface SeasonPlayerSnapshot {
  seasonId: string;
  score: number;
  jumps: number;
  races: number;
  wins: number;
  rewardsClaimed: number;
  bestFrog: string;
  updatedAt: number;
}

export interface WeeklySnapshot {
  score: number;
  wins: number;
  races: number;
}

export interface WeeklyRewardClaim {
  weekId: string;
  rank: number | null;
  score: number;
  flies: number;
  badge: string;
  skin: string;
  claimedAt: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __jumpFrogsStore: Map<string, PlayerState> | undefined;
  // eslint-disable-next-line no-var
  var __jumpFrogsLedger: ProjectRewardsLedger | undefined;
  // eslint-disable-next-line no-var
  var __jumpFrogsRewardLedger: TokenRewardLedger | undefined;
  // eslint-disable-next-line no-var
  var __jumpFrogsRewardClaims: Map<string, TokenRewardClaim> | undefined;
}

if (!global.__jumpFrogsStore) {
  global.__jumpFrogsStore = new Map<string, PlayerState>();
}

if (!global.__jumpFrogsLedger) {
  global.__jumpFrogsLedger = {
    holderRewardsPool: 0,
    seasonPrizePool: 0,
    buybackBurnPool: 0,
    developmentPool: 0,
    totalReturnedToProject: 0,
    externalAmount: 0,
    creatorRewardsRecorded: 0,
    dailyActivePool: 0,
    seasonLeaderboardPool: 0,
    reservePool: 0,
    totalJumpRewardsPaid: 0,
    dailyJumpScoreTotal: 0,
    seasonJumpScoreTotal: 0,
    dailyJumpDay: new Date().toISOString().slice(0, 10),
    lastProcessedSignature: "",
    lastAutoSyncAt: 0,
    autoSyncCount: 0,
    totalTokensBurned: 0,
    dailyTokensBurned: 0,
    dailyBurnDay: new Date().toISOString().slice(0, 10),
    racePool: 0,
    totalRacePrizesPaid: 0,
  };
}

if (!global.__jumpFrogsRewardLedger) {
  global.__jumpFrogsRewardLedger = {
    dailyPoolRemaining: 100_000,
    dailyClaimCount: 0,
    dailyClaimDay: new Date().toISOString().slice(0, 10),
    totalTokenRewardsPaid: 0,
    failedPayouts: 0,
  };
}

if (!global.__jumpFrogsRewardClaims) {
  global.__jumpFrogsRewardClaims = new Map<string, TokenRewardClaim>();
}

export const store = global.__jumpFrogsStore;
export const projectLedger = global.__jumpFrogsLedger;
export const tokenRewardLedger = global.__jumpFrogsRewardLedger;
export const rewardClaims = global.__jumpFrogsRewardClaims;

export function makeToad(kind: ToadKind): Toad {
  const template = TOAD_TEMPLATES[kind];
  const today = new Date().toISOString().slice(0, 10);
  const maxEnergy = TOAD_DAILY_ENERGY[kind];
  return {
    id: crypto.randomUUID(),
    kind,
    name: template.name,
    rarity: template.rarity,
    speed: template.speed,
    stamina: template.stamina,
    luck: template.luck,
    consistency: template.consistency,
    xp: 0,
    level: 1,
    skin: "Classic",
    energy: maxEnergy,
    maxEnergy,
    lastEnergyRefillDate: today,
    active: false,
    lastJumpAt: 0,
    jumps: 0,
  };
}

export function defaultState(wallet: string): PlayerState {
  const now = Date.now();
  return {
    wallet,
    initialized: false,
    tokenBalance: 0,
    flies: 0,
    toads: [],
    selectedToadId: null,
    totalRaces: 0,
    wins: 0,
    losses: 0,
    racePoints: 0,
    weeklyScore: 0,
    weeklyWins: 0,
    weeklyRaces: 0,
    currentWeekId: currentWeekId(),
    weeklyHistory: {},
    lastWeeklyClaimId: "",
    weeklyRewardClaims: [],
    totalXp: 0,
    gachaPulls: 0,
    lastDailyClaimDate: "",
    lastRewardClaimAt: 0,
    nextRewardClaimAt: 0,
    latestRewardClaimId: "",
    lastJumpSettledAt: now,
    dailyJumpScore: 0,
    dailyJumpCount: 0,
    dailyJumpDay: new Date().toISOString().slice(0, 10),
    seasonJumpScore: 0,
    seasonJumpCount: 0,
    lifetimeJumps: 0,
    lifetimeJumpScore: 0,
    lastActiveSeasonId: currentWeekId(),
    seasonHistory: {},
    lastVerifiedAt: 0,
    lastFlyClaimAt: 0,
    lastRaceWindowId: 0,
    lastRaceResult: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function currentWeekId(date = new Date()): string {
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utc.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function previousWeekId(date = new Date()): string {
  const previous = new Date(date);
  previous.setUTCDate(previous.getUTCDate() - 7);
  return currentWeekId(previous);
}

export function getOrCreate(wallet: string): PlayerState {
  const existing = store.get(wallet);
  if (existing) return existing;
  const state = defaultState(wallet);
  store.set(wallet, state);
  return state;
}

export function initializePlayer(state: PlayerState, tokenBalance: number): PlayerState {
  migratePlayer(state);
  if (!state.initialized) {
    state.initialized = true;
    state.flies = STARTER_FLIES;
    state.createdAt = state.createdAt || Date.now();
  }
  state.tokenBalance = tokenBalance;
  state.lastVerifiedAt = Date.now();
  state.updatedAt = Date.now();
  return state;
}

export function migratePlayer(state: PlayerState): PlayerState {
  state.weeklyWins ??= 0;
  state.weeklyRaces ??= 0;
  state.currentWeekId ||= currentWeekId();
  state.weeklyHistory ||= {};
  state.lastWeeklyClaimId ||= "";
  state.weeklyRewardClaims ||= [];
  state.lastRewardClaimAt ||= 0;
  state.nextRewardClaimAt ||= 0;
  state.latestRewardClaimId ||= "";
  state.lastJumpSettledAt ||= Date.now();
  state.dailyJumpScore ??= 0;
  state.dailyJumpCount ??= 0;
  state.dailyJumpDay ||= new Date().toISOString().slice(0, 10);
  state.seasonJumpScore ??= 0;
  state.seasonJumpCount ??= 0;
  state.lifetimeJumps ??= 0;
  state.lifetimeJumpScore ??= 0;
  state.lastActiveSeasonId ||= currentWeekId();
  state.seasonHistory ||= {};
  state.lastFlyClaimAt ??= 0;
  state.lastRaceWindowId ??= 0;
  state.lastRaceResult ??= null;

  const today = new Date().toISOString().slice(0, 10);
  if (state.dailyJumpDay !== today) {
    state.dailyJumpScore = 0;
    state.dailyJumpCount = 0;
    state.dailyJumpDay = today;
  }

  const weekId = currentWeekId();
  if (state.lastActiveSeasonId !== weekId) {
    const previousToad = state.toads?.find((toad) => toad.id === state.selectedToadId) ?? state.toads?.[0];
    state.seasonHistory[state.lastActiveSeasonId] = {
      seasonId: state.lastActiveSeasonId,
      score: state.seasonJumpScore,
      jumps: state.seasonJumpCount,
      races: state.weeklyRaces,
      wins: state.weeklyWins,
      rewardsClaimed: state.weeklyRewardClaims
        .filter((claim) => claim.weekId === state.lastActiveSeasonId)
        .reduce((sum, claim) => sum + claim.flies, 0),
      bestFrog: previousToad?.name ?? "No frog",
      updatedAt: Date.now(),
    };
    state.lastActiveSeasonId = weekId;
    state.seasonJumpScore = 0;
    state.seasonJumpCount = 0;
  }

  for (const toad of state.toads ?? []) {
    const maxEnergy = TOAD_DAILY_ENERGY[toad.kind];
    toad.maxEnergy ??= maxEnergy;
    toad.energy ??= toad.maxEnergy;
    toad.lastEnergyRefillDate ||= new Date().toISOString().slice(0, 10);
    toad.active ??= false;
    toad.lastJumpAt ??= 0;
    // Seed from XP history: total XP spent = 25*(level-1)*level/2 + residual xp
    const xpJumps = Math.round(25 * ((toad.level ?? 1) - 1) * (toad.level ?? 1) / 2) + (toad.xp ?? 0);
    toad.jumps = Math.max(toad.jumps ?? 0, xpJumps);
  }

  // Auto-activate the selected toad for existing players who predate the active system
  const hasAnyActive = (state.toads ?? []).some(t => t.active);
  if (!hasAnyActive && state.initialized && state.toads.length > 0) {
    const selected = state.toads.find(t => t.id === state.selectedToadId) ?? state.toads[0];
    selected.active = true;
    selected.lastJumpAt = state.lastJumpSettledAt || Date.now();
  }

  return state;
}

export function selectedToad(state: PlayerState): Toad | null {
  migratePlayer(state);
  if (!state.toads.length) return null;
  return state.toads.find((toad) => toad.id === state.selectedToadId) ?? state.toads[0];
}

export function refillToadEnergy(toad: Toad): void {
  const today = new Date().toISOString().slice(0, 10);
  const maxEnergy = TOAD_DAILY_ENERGY[toad.kind];
  toad.maxEnergy = maxEnergy;
  if (toad.lastEnergyRefillDate !== today) {
    toad.energy = maxEnergy;
    toad.lastEnergyRefillDate = today;
  }
}

export function refreshPlayerEnergy(state: PlayerState): void {
  migratePlayer(state);
  for (const toad of state.toads) refillToadEnergy(toad);
}

export function awardToadXp(toad: Toad, xp: number): void {
  toad.xp += xp;
  while (toad.xp >= toad.level * 25) {
    toad.xp -= toad.level * 25;
    toad.level += 1;
    toad.speed += 2;
    toad.stamina += 2;
    toad.consistency += 1;
    if (toad.kind === "shadow") toad.luck += 2;
  }
}

export function recordCreatorRewards(amount: number): ProjectRewardsLedger {
  const safeAmount = Math.max(0, amount);
  projectLedger.dailyActivePool += safeAmount;
  projectLedger.holderRewardsPool += safeAmount;
  projectLedger.creatorRewardsRecorded += safeAmount;
  projectLedger.totalReturnedToProject += safeAmount;
  return projectLedger;
}

export function publicWallet(wallet: string): string {
  return `${wallet.slice(0, 4)}...${wallet.slice(-4)}`;
}
