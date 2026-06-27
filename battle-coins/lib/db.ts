import { sql } from "@vercel/postgres";
import { ProductionReadinessError, toadJumpConfig } from "./config";

export function pgConfigured(): boolean {
  return !!(
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL_NON_POOLING
  );
}

export function requirePostgres(): void {
  if (toadJumpConfig.isProduction && !pgConfigured()) {
    throw new ProductionReadinessError("Vercel Postgres is required in production");
  }
}

let _schemaReady = false;

export async function ensureSchema(): Promise<void> {
  requirePostgres();
  if (_schemaReady || !pgConfigured()) return;
  _schemaReady = true;
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS players (
        wallet     TEXT PRIMARY KEY,
        data       JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS race_events (
        window_id  BIGINT PRIMARY KEY,
        data       JSONB NOT NULL,
        expires_at TIMESTAMPTZ
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS ledger (
        id   TEXT PRIMARY KEY,
        data JSONB NOT NULL
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS reward_claims (
        id         TEXT PRIMARY KEY,
        data       JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS auth_nonces (
        nonce      TEXT PRIMARY KEY,
        wallet     TEXT NOT NULL,
        message    TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        used_at    TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS auth_nonces_wallet_idx ON auth_nonces (wallet)`;
    await sql`
      CREATE TABLE IF NOT EXISTS payment_intents (
        id         TEXT PRIMARY KEY,
        wallet     TEXT NOT NULL,
        signature  TEXT UNIQUE,
        data       JSONB NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS payment_intents_wallet_idx ON payment_intents (wallet)`;
    await sql`CREATE INDEX IF NOT EXISTS payment_intents_expires_idx ON payment_intents (expires_at)`;
  } catch (error) {
    _schemaReady = false;
    if (toadJumpConfig.isProduction) {
      throw new ProductionReadinessError(
        error instanceof Error ? `Postgres schema is not ready: ${error.message}` : "Postgres schema is not ready"
      );
    }
  }
}

export async function withPostgresAdvisoryLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  if (!pgConfigured()) return fn();
  const client = await sql.connect();
  try {
    await client.sql`BEGIN`;
    await client.sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
    const result = await fn();
    await client.sql`COMMIT`;
    return result;
  } catch (error) {
    try {
      await client.sql`ROLLBACK`;
    } catch {}
    throw error;
  } finally {
    client.release();
  }
}

export { sql };
