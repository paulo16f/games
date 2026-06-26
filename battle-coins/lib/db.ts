import { sql } from "@vercel/postgres";

export function pgConfigured(): boolean {
  return !!(
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL_NON_POOLING
  );
}

let _schemaReady = false;

export async function ensureSchema(): Promise<void> {
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
  } catch {
    _schemaReady = false;
  }
}

export { sql };
