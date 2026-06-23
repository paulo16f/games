import { kvConfigured, toadJumpConfig } from "./config";
import {
  defaultState,
  migratePlayer,
  PlayerState,
  projectLedger,
  ProjectRewardsLedger,
  RaceEventRecord,
  rewardClaims,
  store,
  TokenRewardClaim,
  tokenRewardLedger,
  TokenRewardLedger,
} from "./store";

declare global {
  // eslint-disable-next-line no-var
  var __toadJumpRaceEvents: Map<number, RaceEventRecord> | undefined;
}
if (!global.__toadJumpRaceEvents) {
  global.__toadJumpRaceEvents = new Map<number, RaceEventRecord>();
}
const raceEventStore = global.__toadJumpRaceEvents;

const PLAYER_INDEX_KEY = "index:players";
const PROJECT_LEDGER_KEY = "ledger:project";
const REWARD_LEDGER_KEY = "ledger:rewards";

async function kvCommand<T>(args: Array<string | number>): Promise<T | null> {
  if (!kvConfigured()) return null;
  const res = await fetch(toadJumpConfig.kvRestApiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${toadJumpConfig.kvRestApiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`KV command failed: ${res.status}`);
  const data = await res.json();
  return data.result as T;
}

function parseJson<T>(value: unknown): T | null {
  if (!value) return null;
  if (typeof value === "string") return JSON.parse(value) as T;
  return value as T;
}

function playerKey(wallet: string): string {
  return `player:${wallet}`;
}

function normalizeProjectLedger(ledger: ProjectRewardsLedger): ProjectRewardsLedger {
  const today = new Date().toISOString().slice(0, 10);
  ledger.holderRewardsPool ??= 0;
  ledger.seasonPrizePool ??= 0;
  ledger.buybackBurnPool ??= 0;
  ledger.developmentPool ??= 0;
  ledger.totalReturnedToProject ??= 0;
  ledger.externalAmount ??= 0;
  ledger.creatorRewardsRecorded ??= 0;
  ledger.dailyActivePool ??= ledger.holderRewardsPool ?? 0;
  ledger.seasonLeaderboardPool ??= ledger.seasonPrizePool ?? 0;
  ledger.reservePool ??= ledger.buybackBurnPool ?? 0;
  ledger.totalJumpRewardsPaid ??= 0;
  ledger.dailyJumpScoreTotal ??= 0;
  ledger.seasonJumpScoreTotal ??= 0;
  ledger.dailyJumpDay ||= today;
  if (ledger.dailyJumpDay !== today) {
    ledger.dailyJumpDay = today;
    ledger.dailyJumpScoreTotal = 0;
  }
  ledger.lastProcessedSignature ??= "";
  ledger.lastAutoSyncAt ??= 0;
  ledger.autoSyncCount ??= 0;
  ledger.totalTokensBurned ??= 0;
  ledger.dailyTokensBurned ??= 0;
  ledger.dailyBurnDay ||= today;
  if (ledger.dailyBurnDay !== today) {
    ledger.dailyBurnDay = today;
    ledger.dailyTokensBurned = 0;
  }
  ledger.racePool ??= 0;
  ledger.totalRacePrizesPaid ??= 0;
  return ledger;
}

function rewardKey(id: string): string {
  return `reward:${id}`;
}

export async function getPlayer(wallet: string): Promise<PlayerState> {
  if (kvConfigured()) {
    const value = await kvCommand<string>(["GET", playerKey(wallet)]);
    const player = parseJson<PlayerState>(value);
    return player ? migratePlayer(player) : defaultState(wallet);
  }
  const player = store.get(wallet);
  return player ? migratePlayer(player) : defaultState(wallet);
}

export async function getOrCreatePlayer(wallet: string): Promise<PlayerState> {
  const existing = await getPlayer(wallet);
  if (existing.initialized || existing.createdAt !== 0) return existing;
  await savePlayer(existing);
  return existing;
}

export async function savePlayer(player: PlayerState): Promise<PlayerState> {
  migratePlayer(player);
  player.updatedAt = Date.now();
  if (kvConfigured()) {
    await kvCommand(["SET", playerKey(player.wallet), JSON.stringify(player)]);
    await kvCommand(["SADD", PLAYER_INDEX_KEY, player.wallet]);
  } else {
    store.set(player.wallet, player);
  }
  return player;
}

export async function listPlayers(): Promise<PlayerState[]> {
  if (kvConfigured()) {
    const wallets = (await kvCommand<string[]>(["SMEMBERS", PLAYER_INDEX_KEY])) ?? [];
    const players = await Promise.all(wallets.map((wallet) => getPlayer(wallet)));
    return players.map(migratePlayer);
  }
  return [...store.values()].map(migratePlayer);
}

export async function getLedger(): Promise<ProjectRewardsLedger> {
  if (kvConfigured()) {
    const value = await kvCommand<string>(["GET", PROJECT_LEDGER_KEY]);
    const ledger = parseJson<ProjectRewardsLedger>(value);
    if (ledger) return normalizeProjectLedger(ledger);
  }
  return normalizeProjectLedger(projectLedger);
}

export async function saveLedger(ledger: ProjectRewardsLedger): Promise<ProjectRewardsLedger> {
  normalizeProjectLedger(ledger);
  if (kvConfigured()) {
    await kvCommand(["SET", PROJECT_LEDGER_KEY, JSON.stringify(ledger)]);
  } else {
    projectLedger.holderRewardsPool = ledger.holderRewardsPool;
    projectLedger.seasonPrizePool = ledger.seasonPrizePool;
    projectLedger.buybackBurnPool = ledger.buybackBurnPool;
    projectLedger.developmentPool = ledger.developmentPool;
    projectLedger.totalReturnedToProject = ledger.totalReturnedToProject;
    projectLedger.externalAmount = ledger.externalAmount;
    projectLedger.creatorRewardsRecorded = ledger.creatorRewardsRecorded;
    projectLedger.dailyActivePool = ledger.dailyActivePool;
    projectLedger.seasonLeaderboardPool = ledger.seasonLeaderboardPool;
    projectLedger.reservePool = ledger.reservePool;
    projectLedger.totalJumpRewardsPaid = ledger.totalJumpRewardsPaid;
    projectLedger.dailyJumpScoreTotal = ledger.dailyJumpScoreTotal;
    projectLedger.seasonJumpScoreTotal = ledger.seasonJumpScoreTotal;
    projectLedger.dailyJumpDay = ledger.dailyJumpDay;
    projectLedger.lastProcessedSignature = ledger.lastProcessedSignature;
    projectLedger.lastAutoSyncAt = ledger.lastAutoSyncAt;
    projectLedger.autoSyncCount = ledger.autoSyncCount;
    projectLedger.totalTokensBurned = ledger.totalTokensBurned;
    projectLedger.dailyTokensBurned = ledger.dailyTokensBurned;
    projectLedger.dailyBurnDay = ledger.dailyBurnDay;
    projectLedger.racePool = ledger.racePool;
    projectLedger.totalRacePrizesPaid = ledger.totalRacePrizesPaid;
  }
  return ledger;
}

export async function getRewardLedger(): Promise<TokenRewardLedger> {
  if (kvConfigured()) {
    const value = await kvCommand<string>(["GET", REWARD_LEDGER_KEY]);
    const ledger = parseJson<TokenRewardLedger>(value);
    if (ledger) return ledger;
  }
  return tokenRewardLedger;
}

export async function saveRewardLedger(ledger: TokenRewardLedger): Promise<TokenRewardLedger> {
  if (kvConfigured()) {
    await kvCommand(["SET", REWARD_LEDGER_KEY, JSON.stringify(ledger)]);
  } else {
    tokenRewardLedger.dailyPoolRemaining = ledger.dailyPoolRemaining;
    tokenRewardLedger.dailyClaimCount = ledger.dailyClaimCount;
    tokenRewardLedger.dailyClaimDay = ledger.dailyClaimDay;
    tokenRewardLedger.totalTokenRewardsPaid = ledger.totalTokenRewardsPaid;
    tokenRewardLedger.failedPayouts = ledger.failedPayouts;
  }
  return ledger;
}

export async function getRewardClaim(id: string): Promise<TokenRewardClaim | null> {
  if (kvConfigured()) {
    const value = await kvCommand<string>(["GET", rewardKey(id)]);
    return parseJson<TokenRewardClaim>(value);
  }
  return rewardClaims.get(id) ?? null;
}

export async function saveRewardClaim(claim: TokenRewardClaim): Promise<TokenRewardClaim> {
  claim.updatedAt = Date.now();
  if (kvConfigured()) {
    await kvCommand(["SET", rewardKey(claim.id), JSON.stringify(claim)]);
  } else {
    rewardClaims.set(claim.id, claim);
  }
  return claim;
}

export async function latestRewardClaim(player: PlayerState): Promise<TokenRewardClaim | null> {
  return player.latestRewardClaimId ? getRewardClaim(player.latestRewardClaimId) : null;
}

function raceKey(windowId: number): string {
  return `race:${windowId}`;
}

export async function getRaceEvent(windowId: number): Promise<RaceEventRecord | null> {
  if (kvConfigured()) {
    const value = await kvCommand<string>(["GET", raceKey(windowId)]);
    return parseJson<RaceEventRecord>(value);
  }
  return raceEventStore.get(windowId) ?? null;
}

export async function saveRaceEvent(event: RaceEventRecord): Promise<void> {
  if (kvConfigured()) {
    await kvCommand(["SET", raceKey(event.windowId), JSON.stringify(event), "EX", String(7 * 24 * 3600)]);
  } else {
    raceEventStore.set(event.windowId, event);
  }
}
