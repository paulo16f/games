import { kvConfigured, ProductionReadinessError, toadJumpConfig } from "./config";
import { ensureSchema, pgConfigured, sql } from "./db";
import {
  defaultState,
  migratePlayer,
  PlayerState,
  PaymentIntent,
  paymentIntents,
  projectLedger,
  ProjectRewardsLedger,
  RaceEventRecord,
  rewardClaims,
  store,
  TokenRewardClaim,
  tokenRewardLedger,
  TokenRewardLedger,
} from "./store";

// ─── In-process race event store (serverless fallback) ───────────────────────
declare global {
  // eslint-disable-next-line no-var
  var __toadJumpRaceEvents: Map<number, RaceEventRecord> | undefined;
}
if (!global.__toadJumpRaceEvents) {
  global.__toadJumpRaceEvents = new Map<number, RaceEventRecord>();
}
const raceEventStore = global.__toadJumpRaceEvents;

// ─── Redis keys (cache only) ──────────────────────────────────────────────────
const PLAYER_INDEX_KEY = "index:players";
const PROJECT_LEDGER_KEY = "ledger:project";
const REWARD_LEDGER_KEY = "ledger:rewards";
const META_CACHE_KEY = "cache:meta";
const META_CACHE_TTL = 60;

function requireProductionPersistence(): void {
  if (toadJumpConfig.isProduction && !pgConfigured()) {
    throw new ProductionReadinessError("Vercel Postgres is required in production");
  }
}

// ─── Redis REST client (cache only after Postgres migration) ─────────────────
async function kvCommand<T>(args: Array<string | number>): Promise<T | null> {
  if (!kvConfigured()) return null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(toadJumpConfig.kvRestApiUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${toadJumpConfig.kvRestApiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(args),
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        return data.result as T;
      }
    } catch {
      if (attempt === 1) return null;
    }
  }
  return null;
}

function parseJson<T>(value: unknown): T | null {
  if (!value) return null;
  if (typeof value === "string") return JSON.parse(value) as T;
  return value as T;
}

function playerKey(wallet: string): string {
  return `player:${wallet}`;
}

function rewardKey(id: string): string {
  return `reward:${id}`;
}

function paymentIntentKey(id: string): string {
  return `payment:${id}`;
}

function raceKey(windowId: number): string {
  return `race:${windowId}`;
}

// ─── Cache invalidation ───────────────────────────────────────────────────────
export async function invalidateMetaCache(): Promise<void> {
  await kvCommand(["DEL", META_CACHE_KEY]);
}

// ─── Ledger normalization ─────────────────────────────────────────────────────
function normalizeProjectLedger(ledger: ProjectRewardsLedger): ProjectRewardsLedger {
  const today = new Date().toISOString().slice(0, 10);
  ledger.holderRewardsPool ??= 0;
  ledger.seasonPrizePool ??= 0;
  ledger.buybackBurnPool ??= 0;
  ledger.developmentPool ??= 0;
  ledger.totalReturnedToProject ??= 0;
  ledger.externalAmount ??= 0;
  ledger.creatorRewardsRecorded ??= 0;
  ledger.creatorRewardsSolRecorded ??= 0;
  ledger.tokenRewardsFunded ??= 0;
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

// ─── Players ──────────────────────────────────────────────────────────────────
export async function getPlayer(wallet: string): Promise<PlayerState> {
  requireProductionPersistence();
  if (pgConfigured()) {
    await ensureSchema();
    const { rows } = await sql`SELECT data FROM players WHERE wallet = ${wallet}`;
    if (rows[0]) return migratePlayer(rows[0].data as PlayerState);

    // Auto-migrate from Redis if present
    if (kvConfigured()) {
      const value = await kvCommand<string>(["GET", playerKey(wallet)]);
      const redisPlayer = parseJson<PlayerState>(value);
      if (redisPlayer?.initialized) {
        const migrated = migratePlayer(redisPlayer);
        await savePlayer(migrated);
        return migrated;
      }
    }
    return defaultState(wallet);
  }

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
  requireProductionPersistence();
  migratePlayer(player);
  player.updatedAt = Date.now();

  if (pgConfigured()) {
    await ensureSchema();
    const data = JSON.stringify(player);
    await sql`
      INSERT INTO players (wallet, data, updated_at)
      VALUES (${player.wallet}, ${data}::jsonb, NOW())
      ON CONFLICT (wallet) DO UPDATE
      SET data = ${data}::jsonb, updated_at = NOW()
    `;
    return player;
  }

  if (kvConfigured()) {
    await kvCommand(["SET", playerKey(player.wallet), JSON.stringify(player)]);
    if (player.initialized) {
      await kvCommand(["SADD", PLAYER_INDEX_KEY, player.wallet]);
    }
  } else {
    store.set(player.wallet, player);
  }
  return player;
}

export async function listPlayers(): Promise<PlayerState[]> {
  requireProductionPersistence();
  if (pgConfigured()) {
    await ensureSchema();
    const { rows } = await sql`
      SELECT data FROM players
      WHERE (data->>'initialized')::boolean = true
    `;
    return rows.map((r) => migratePlayer(r.data as PlayerState));
  }

  if (kvConfigured()) {
    const wallets = (await kvCommand<string[]>(["SMEMBERS", PLAYER_INDEX_KEY])) ?? [];
    const players = await Promise.all(wallets.map((w) => getPlayer(w)));
    return players.map(migratePlayer);
  }

  return [...store.values()].map(migratePlayer);
}

// ─── Project Ledger ───────────────────────────────────────────────────────────
export async function getLedger(): Promise<ProjectRewardsLedger> {
  requireProductionPersistence();
  if (pgConfigured()) {
    await ensureSchema();
    const { rows } = await sql`SELECT data FROM ledger WHERE id = 'project'`;
    if (rows[0]) return normalizeProjectLedger(rows[0].data as ProjectRewardsLedger);
    return normalizeProjectLedger({ ...projectLedger });
  }

  if (kvConfigured()) {
    const value = await kvCommand<string>(["GET", PROJECT_LEDGER_KEY]);
    const ledger = parseJson<ProjectRewardsLedger>(value);
    if (ledger) return normalizeProjectLedger(ledger);
  }
  return normalizeProjectLedger(projectLedger);
}

export async function saveLedger(ledger: ProjectRewardsLedger): Promise<ProjectRewardsLedger> {
  requireProductionPersistence();
  normalizeProjectLedger(ledger);

  if (pgConfigured()) {
    await ensureSchema();
    const data = JSON.stringify(ledger);
    await sql`
      INSERT INTO ledger (id, data) VALUES ('project', ${data}::jsonb)
      ON CONFLICT (id) DO UPDATE SET data = ${data}::jsonb
    `;
    return ledger;
  }

  if (kvConfigured()) {
    await kvCommand(["SET", PROJECT_LEDGER_KEY, JSON.stringify(ledger)]);
  } else {
    Object.assign(projectLedger, ledger);
  }
  return ledger;
}

// ─── Reward Ledger ────────────────────────────────────────────────────────────
export async function getRewardLedger(): Promise<TokenRewardLedger> {
  requireProductionPersistence();
  if (pgConfigured()) {
    await ensureSchema();
    const { rows } = await sql`SELECT data FROM ledger WHERE id = 'rewards'`;
    if (rows[0]) return rows[0].data as TokenRewardLedger;
    return { ...tokenRewardLedger };
  }

  if (kvConfigured()) {
    const value = await kvCommand<string>(["GET", REWARD_LEDGER_KEY]);
    const ledger = parseJson<TokenRewardLedger>(value);
    if (ledger) return ledger;
  }
  return tokenRewardLedger;
}

export async function saveRewardLedger(ledger: TokenRewardLedger): Promise<TokenRewardLedger> {
  requireProductionPersistence();
  if (pgConfigured()) {
    await ensureSchema();
    const data = JSON.stringify(ledger);
    await sql`
      INSERT INTO ledger (id, data) VALUES ('rewards', ${data}::jsonb)
      ON CONFLICT (id) DO UPDATE SET data = ${data}::jsonb
    `;
    return ledger;
  }

  if (kvConfigured()) {
    await kvCommand(["SET", REWARD_LEDGER_KEY, JSON.stringify(ledger)]);
  } else {
    Object.assign(tokenRewardLedger, ledger);
  }
  return ledger;
}

// ─── Reward Claims ────────────────────────────────────────────────────────────
export async function getRewardClaim(id: string): Promise<TokenRewardClaim | null> {
  requireProductionPersistence();
  if (pgConfigured()) {
    await ensureSchema();
    const { rows } = await sql`SELECT data FROM reward_claims WHERE id = ${id}`;
    return rows[0]?.data ?? null;
  }

  if (kvConfigured()) {
    const value = await kvCommand<string>(["GET", rewardKey(id)]);
    return parseJson<TokenRewardClaim>(value);
  }
  return rewardClaims.get(id) ?? null;
}

export async function saveRewardClaim(claim: TokenRewardClaim): Promise<TokenRewardClaim> {
  requireProductionPersistence();
  claim.updatedAt = Date.now();

  if (pgConfigured()) {
    await ensureSchema();
    const data = JSON.stringify(claim);
    await sql`
      INSERT INTO reward_claims (id, data, updated_at)
      VALUES (${claim.id}, ${data}::jsonb, NOW())
      ON CONFLICT (id) DO UPDATE
      SET data = ${data}::jsonb, updated_at = NOW()
    `;
    return claim;
  }

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

export async function getPaymentIntent(id: string): Promise<PaymentIntent | null> {
  requireProductionPersistence();
  if (pgConfigured()) {
    await ensureSchema();
    const { rows } = await sql`SELECT data FROM payment_intents WHERE id = ${id}`;
    return rows[0]?.data ?? null;
  }

  if (kvConfigured()) {
    const value = await kvCommand<string>(["GET", paymentIntentKey(id)]);
    return parseJson<PaymentIntent>(value);
  }
  return paymentIntents.get(id) ?? null;
}

export async function getPaymentIntentBySignature(signature: string): Promise<PaymentIntent | null> {
  requireProductionPersistence();
  if (pgConfigured()) {
    await ensureSchema();
    const { rows } = await sql`SELECT data FROM payment_intents WHERE signature = ${signature}`;
    return rows[0]?.data ?? null;
  }

  for (const intent of paymentIntents.values()) {
    if (intent.signature === signature) return intent;
  }
  return null;
}

export async function savePaymentIntent(intent: PaymentIntent): Promise<PaymentIntent> {
  requireProductionPersistence();
  intent.updatedAt = Date.now();

  if (pgConfigured()) {
    await ensureSchema();
    const data = JSON.stringify(intent);
    await sql`
      INSERT INTO payment_intents (id, wallet, signature, data, expires_at, updated_at)
      VALUES (${intent.id}, ${intent.wallet}, ${intent.signature}, ${data}::jsonb, TO_TIMESTAMP(${intent.expiresAt / 1000}), NOW())
      ON CONFLICT (id) DO UPDATE
      SET signature = ${intent.signature}, data = ${data}::jsonb, expires_at = TO_TIMESTAMP(${intent.expiresAt / 1000}), updated_at = NOW()
    `;
    return intent;
  }

  if (kvConfigured()) {
    const ttl = Math.max(60, Math.ceil((intent.expiresAt - Date.now()) / 1000) + 3600);
    await kvCommand(["SET", paymentIntentKey(intent.id), JSON.stringify(intent), "EX", String(ttl)]);
  } else {
    paymentIntents.set(intent.id, intent);
  }
  return intent;
}

// ─── Race Events ──────────────────────────────────────────────────────────────
export async function getRaceEvent(windowId: number): Promise<RaceEventRecord | null> {
  requireProductionPersistence();
  if (pgConfigured()) {
    await ensureSchema();
    const { rows } = await sql`SELECT data FROM race_events WHERE window_id = ${windowId}`;
    return rows[0]?.data ?? null;
  }

  if (kvConfigured()) {
    const value = await kvCommand<string>(["GET", raceKey(windowId)]);
    return parseJson<RaceEventRecord>(value);
  }
  return raceEventStore.get(windowId) ?? null;
}

export async function saveRaceEvent(event: RaceEventRecord): Promise<void> {
  requireProductionPersistence();
  if (pgConfigured()) {
    await ensureSchema();
    const data = JSON.stringify(event);
    await sql`
      INSERT INTO race_events (window_id, data, expires_at)
      VALUES (${event.windowId}, ${data}::jsonb, NOW() + INTERVAL '7 days')
      ON CONFLICT (window_id) DO UPDATE
      SET data = ${data}::jsonb
    `;
    return;
  }

  if (kvConfigured()) {
    await kvCommand(["SET", raceKey(event.windowId), JSON.stringify(event), "EX", String(7 * 24 * 3600)]);
  } else {
    raceEventStore.set(event.windowId, event);
  }
}

// ─── Meta cache (Redis only — short-lived) ────────────────────────────────────
export async function getMetaCache(): Promise<unknown | null> {
  if (!kvConfigured()) return null;
  const raw = await kvCommand<string>(["GET", META_CACHE_KEY]);
  return raw ? parseJson<unknown>(raw) : null;
}

export async function saveMetaCache(data: unknown): Promise<void> {
  if (!kvConfigured()) return;
  await kvCommand(["SET", META_CACHE_KEY, JSON.stringify(data), "EX", String(META_CACHE_TTL)]);
}

export { publicWallet } from "./store";
