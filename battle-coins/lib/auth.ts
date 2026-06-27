import crypto from "crypto";
import nacl from "tweetnacl";
import { toadJumpConfig, ProductionReadinessError } from "./config";
import { ensureSchema, pgConfigured, sql } from "./db";
import { normalizePublicKey, publicKeyBytes } from "./solana-lite";

export const SESSION_COOKIE = "toad_session";
const NONCE_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

interface StoredNonce {
  wallet: string;
  message: string;
  expiresAt: number;
  usedAt: number | null;
}

interface SessionPayload {
  wallet: string;
  issuedAt: number;
  expiresAt: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __toadJumpAuthNonces: Map<string, StoredNonce> | undefined;
}

if (!global.__toadJumpAuthNonces) {
  global.__toadJumpAuthNonces = new Map<string, StoredNonce>();
}

const authNonceStore = global.__toadJumpAuthNonces;

function sessionSecret(): string {
  if (toadJumpConfig.sessionSecret) return toadJumpConfig.sessionSecret;
  if (!toadJumpConfig.isProduction) return "local-dev-toad-session-secret";
  throw new ProductionReadinessError("SESSION_SECRET is required in production");
}

function base64Url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function signPayload(payload: string): string {
  return crypto.createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

export function createSiwsMessage(wallet: string, nonce: string, issuedAt = new Date()): string {
  return [
    "Sign in to Toad Jump",
    "",
    "This request proves wallet ownership and does not trigger a blockchain transaction.",
    `Wallet: ${wallet}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt.toISOString()}`,
  ].join("\n");
}

export async function createAuthNonce(wallet: string): Promise<{ nonce: string; message: string; expiresAt: number }> {
  const normalizedWallet = normalizePublicKey(wallet);
  const nonce = crypto.randomBytes(24).toString("base64url");
  const expiresAt = Date.now() + NONCE_TTL_MS;
  const message = createSiwsMessage(normalizedWallet, nonce);

  if (pgConfigured()) {
    await ensureSchema();
    await sql`
      INSERT INTO auth_nonces (nonce, wallet, message, expires_at)
      VALUES (${nonce}, ${normalizedWallet}, ${message}, to_timestamp(${expiresAt / 1000}))
    `;
  } else {
    authNonceStore.set(nonce, { wallet: normalizedWallet, message, expiresAt, usedAt: null });
  }

  return { nonce, message, expiresAt };
}

export async function consumeAuthNonce(nonce: string, wallet: string, message: string): Promise<void> {
  const normalizedWallet = normalizePublicKey(wallet);
  const now = Date.now();

  if (pgConfigured()) {
    await ensureSchema();
    const { rows } = await sql`
      UPDATE auth_nonces
      SET used_at = NOW()
      WHERE nonce = ${nonce}
        AND wallet = ${normalizedWallet}
        AND message = ${message}
        AND used_at IS NULL
        AND expires_at > NOW()
      RETURNING nonce
    `;
    if (!rows[0]) throw new Error("Sign-in nonce is invalid, expired, or already used");
    return;
  }

  const stored = authNonceStore.get(nonce);
  if (!stored || stored.wallet !== normalizedWallet || stored.message !== message || stored.usedAt || stored.expiresAt <= now) {
    throw new Error("Sign-in nonce is invalid, expired, or already used");
  }
  stored.usedAt = now;
}

export function parseSignature(signature: unknown): Uint8Array {
  if (Array.isArray(signature)) {
    return Uint8Array.from(signature.map((value) => Number(value)));
  }
  if (typeof signature === "string") {
    return Uint8Array.from(Buffer.from(signature, "base64"));
  }
  throw new Error("signature must be a byte array or base64 string");
}

export async function verifySiwsSignature(input: {
  wallet: string;
  nonce: string;
  message: string;
  signature: unknown;
}): Promise<string> {
  const wallet = normalizePublicKey(input.wallet);
  await consumeAuthNonce(input.nonce, wallet, input.message);

  const signature = parseSignature(input.signature);
  const messageBytes = new TextEncoder().encode(input.message);
  const ok = nacl.sign.detached.verify(messageBytes, signature, publicKeyBytes(wallet));
  if (!ok) throw new Error("Invalid wallet signature");
  return wallet;
}

export function createSessionToken(wallet: string): string {
  const now = Date.now();
  const payload: SessionPayload = {
    wallet,
    issuedAt: now,
    expiresAt: now + SESSION_TTL_SECONDS * 1000,
  };
  const encoded = base64Url(JSON.stringify(payload));
  return `${encoded}.${signPayload(encoded)}`;
}

export function verifySessionToken(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  const expected = signPayload(encoded);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as SessionPayload;
    if (!payload.wallet || payload.expiresAt <= Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: toadJumpConfig.isProduction,
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_TTL_SECONDS,
};
