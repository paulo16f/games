import { toadJumpConfig } from "./config";
import { withPostgresAdvisoryLock } from "./db";
import { handleGameAction } from "./game-engine";
import {
  getLedger,
  getOrCreatePlayer,
  getPaymentIntent,
  getPaymentIntentBySignature,
  saveLedger,
  savePaymentIntent,
  savePlayer,
} from "./repository";
import { normalizePublicKey, publicKeyBytes, rpcCall } from "./solana-lite";
import { PaymentIntent } from "./store";
import { checkToadJumpGate } from "./token-gate";

export const CLAIM_FLIES_SKIP_COST = 1_000;
export const CLAIM_FLIES_SKIP_COOLDOWN_MS = 30 * 60 * 1000;

const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

interface ParsedTokenAccounts {
  value: Array<{ pubkey: string }>;
}

interface LatestBlockhashResult {
  value: {
    blockhash: string;
    lastValidBlockHeight: number;
  };
}

interface ParsedTransactionResult {
  transaction?: {
    signatures?: string[];
    message?: {
      instructions?: Array<{
        programId?: string;
        parsed?: {
          type?: string;
          info?: {
            source?: string;
            destination?: string;
            authority?: string;
            owner?: string;
            mint?: string;
            amount?: string;
            tokenAmount?: {
              amount?: string;
              decimals?: number;
            };
          };
        };
      }>;
    };
  };
  meta?: {
    err?: unknown;
  };
}

function compactLength(n: number): Uint8Array {
  const out: number[] = [];
  let value = n;
  do {
    let elem = value & 0x7f;
    value >>= 7;
    if (value) elem |= 0x80;
    out.push(elem);
  } while (value);
  return Uint8Array.from(out);
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(len);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function u64Le(value: bigint): Uint8Array {
  const out = new Uint8Array(8);
  let current = value;
  for (let i = 0; i < 8; i++) {
    out[i] = Number(current & BigInt(255));
    current >>= BigInt(8);
  }
  return out;
}

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

function pow10BigInt(decimals: number): bigint {
  let result = BigInt(1);
  for (let i = 0; i < decimals; i++) result *= BigInt(10);
  return result;
}

function amountRaw(amountUi: number, decimals: number): string {
  return (BigInt(amountUi) * pow10BigInt(decimals)).toString();
}

function assertPaymentConfig(): { rpcUrl: string; mint: string; treasuryWallet: string } {
  const rpcUrl = toadJumpConfig.rpcUrl;
  const mint = toadJumpConfig.tokenMint;
  const treasuryWallet = toadJumpConfig.treasuryWallet;
  if (!rpcUrl) throw new Error("RPC_URL is required for token spends");
  if (!mint) throw new Error("TOAD_JUMP_TOKEN_MINT is required for token spends");
  if (!treasuryWallet) throw new Error("TREASURY_WALLET is required for token spends");
  return {
    rpcUrl,
    mint: normalizePublicKey(mint),
    treasuryWallet: normalizePublicKey(treasuryWallet),
  };
}

async function firstTokenAccount(owner: string, mint: string): Promise<string> {
  const { rpcUrl } = assertPaymentConfig();
  const accounts = await rpcCall<ParsedTokenAccounts>(rpcUrl, "getTokenAccountsByOwner", [
    owner,
    { mint },
    { encoding: "jsonParsed", commitment: "confirmed" },
  ]);
  const account = accounts.value[0]?.pubkey;
  if (!account) throw new Error(`Token account not found for ${owner}`);
  return normalizePublicKey(account);
}

function buildTransferCheckedTransaction(input: {
  payer: string;
  sourceTokenAccount: string;
  destinationTokenAccount: string;
  mint: string;
  amountRaw: string;
  decimals: number;
  blockhash: string;
}): string {
  const accountKeys = [
    input.payer,
    input.sourceTokenAccount,
    input.destinationTokenAccount,
    input.mint,
    TOKEN_PROGRAM_ID,
  ].map(publicKeyBytes);

  const data = concatBytes([
    Uint8Array.from([12]),
    u64Le(BigInt(input.amountRaw)),
    Uint8Array.from([input.decimals]),
  ]);

  const instruction = concatBytes([
    Uint8Array.from([4]),
    compactLength(4),
    Uint8Array.from([1, 3, 2, 0]),
    compactLength(data.length),
    data,
  ]);

  const message = concatBytes([
    Uint8Array.from([1, 0, 2]),
    compactLength(accountKeys.length),
    ...accountKeys,
    publicKeyBytes(input.blockhash),
    compactLength(1),
    instruction,
  ]);

  const transaction = concatBytes([
    compactLength(1),
    new Uint8Array(64),
    message,
  ]);

  return toBase64(transaction);
}

export async function createClaimFliesSkipIntent(wallet: string): Promise<PaymentIntent> {
  const { rpcUrl, mint, treasuryWallet } = assertPaymentConfig();
  const normalizedWallet = normalizePublicKey(wallet);
  const gate = await checkToadJumpGate(normalizedWallet);
  if (gate.balance < CLAIM_FLIES_SKIP_COST) {
    throw new Error(`Need ${CLAIM_FLIES_SKIP_COST.toLocaleString()} ${gate.symbol} to skip the timer`);
  }

  const state = await getOrCreatePlayer(normalizedWallet);
  const lastClaim = state.lastFlyClaimAt ?? 0;
  if (!lastClaim || Date.now() - lastClaim >= CLAIM_FLIES_SKIP_COOLDOWN_MS) {
    throw new Error("Free flies are ready now. Claim them without paying.");
  }

  const sourceTokenAccount = await firstTokenAccount(normalizedWallet, mint);
  const destinationTokenAccount = await firstTokenAccount(treasuryWallet, mint);
  const blockhash = (await rpcCall<LatestBlockhashResult>(rpcUrl, "getLatestBlockhash", [
    { commitment: "confirmed" },
  ])).value.blockhash;
  const raw = amountRaw(CLAIM_FLIES_SKIP_COST, toadJumpConfig.tokenDecimals);
  const now = Date.now();
  const intent: PaymentIntent = {
    id: crypto.randomUUID(),
    wallet: normalizedWallet,
    purpose: "claim_flies_skip",
    status: "pending",
    mint,
    sourceTokenAccount,
    destinationTokenAccount,
    amountUi: CLAIM_FLIES_SKIP_COST,
    amountRaw: raw,
    decimals: toadJumpConfig.tokenDecimals,
    transactionBase64: buildTransferCheckedTransaction({
      payer: normalizedWallet,
      sourceTokenAccount,
      destinationTokenAccount,
      mint,
      amountRaw: raw,
      decimals: toadJumpConfig.tokenDecimals,
      blockhash,
    }),
    blockhash,
    signature: null,
    expiresAt: now + 10 * 60 * 1000,
    createdAt: now,
    updatedAt: now,
  };
  return savePaymentIntent(intent);
}

async function verifyTokenPayment(intent: PaymentIntent, signature: string): Promise<void> {
  const { rpcUrl } = assertPaymentConfig();
  const parsed = await rpcCall<ParsedTransactionResult | null>(rpcUrl, "getTransaction", [
    signature,
    {
      encoding: "jsonParsed",
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    },
  ]);
  if (!parsed) throw new Error("Token payment is not confirmed yet");
  if (parsed.meta?.err) throw new Error("Token payment transaction failed");
  if (!parsed.transaction?.signatures?.includes(signature)) throw new Error("Signature not found in transaction");

  const instructions = parsed.transaction.message?.instructions ?? [];
  const expectedAuthority = normalizePublicKey(intent.wallet);
  const transfer = instructions.find((ix) => {
    if (ix.programId !== TOKEN_PROGRAM_ID) return false;
    const info = ix.parsed?.info;
    if (!info?.source || !info.destination || !info.mint || !(info.authority || info.owner)) return false;
    const rawAmount = info.tokenAmount?.amount ?? info.amount;
    return (
      ix.parsed?.type === "transferChecked" &&
      normalizePublicKey(info.source ?? "") === intent.sourceTokenAccount &&
      normalizePublicKey(info.destination ?? "") === intent.destinationTokenAccount &&
      normalizePublicKey(info.authority ?? info.owner ?? "") === expectedAuthority &&
      normalizePublicKey(info.mint ?? "") === intent.mint &&
      rawAmount === intent.amountRaw &&
      info.tokenAmount?.decimals === intent.decimals
    );
  });
  if (!transfer) throw new Error("Token payment does not match this intent");
}

async function recordSkipSpendSplit(amount: number): Promise<void> {
  const ledger = await getLedger();
  const today = new Date().toISOString().slice(0, 10);
  if (ledger.dailyBurnDay !== today) {
    ledger.dailyBurnDay = today;
    ledger.dailyTokensBurned = 0;
  }

  const burned = amount * 0.4;
  const recycled = amount * 0.4;
  const treasury = amount * 0.2;
  ledger.totalTokensBurned += burned;
  ledger.dailyTokensBurned += burned;
  ledger.dailyActivePool += recycled;
  ledger.holderRewardsPool += recycled;
  ledger.tokenRewardsFunded += recycled;
  ledger.developmentPool += treasury;
  ledger.totalReturnedToProject += amount;
  await saveLedger(ledger);
}

export async function confirmClaimFliesSkipIntent(wallet: string, intentId: string, signature: string) {
  const normalizedWallet = normalizePublicKey(wallet);
  const normalizedSignature = signature.trim();
  if (!normalizedSignature) throw new Error("signature is required");

  const existing = await getPaymentIntentBySignature(normalizedSignature);
  if (existing && existing.id !== intentId) throw new Error("Token payment signature was already used");

  const intent = await getPaymentIntent(intentId);
  if (!intent) throw new Error("Payment intent not found");
  if (intent.wallet !== normalizedWallet) throw new Error("Payment intent belongs to another wallet");
  if (intent.status === "confirmed") throw new Error("Payment intent already confirmed");
  if (intent.expiresAt < Date.now()) {
    intent.status = "expired";
    await savePaymentIntent(intent);
    throw new Error("Payment intent expired. Try again.");
  }

  await verifyTokenPayment(intent, normalizedSignature);

  return withPostgresAdvisoryLock(`wallet:${normalizedWallet}`, async () => {
    const gate = await checkToadJumpGate(normalizedWallet);
    const state = await getOrCreatePlayer(normalizedWallet);
    const result = await handleGameAction(state, gate, {
      action: "claim_flies_skip",
      verifiedPayment: true,
      paymentSignature: normalizedSignature,
    });
    await recordSkipSpendSplit(intent.amountUi);
    intent.status = "confirmed";
    intent.signature = normalizedSignature;
    await savePaymentIntent(intent);
    const playerData = await savePlayer(state);
    return { playerData, result, gate, intent };
  });
}

export async function sendSignedPaymentTransaction(intentId: string, wallet: string, signedTransactionBase64: string): Promise<string> {
  const normalizedWallet = normalizePublicKey(wallet);
  const intent = await getPaymentIntent(intentId);
  if (!intent) throw new Error("Payment intent not found");
  if (intent.wallet !== normalizedWallet) throw new Error("Payment intent belongs to another wallet");
  if (intent.status !== "pending") throw new Error("Payment intent is not pending");
  if (intent.expiresAt < Date.now()) throw new Error("Payment intent expired. Try again.");
  const { rpcUrl } = assertPaymentConfig();
  return rpcCall<string>(rpcUrl, "sendTransaction", [
    signedTransactionBase64,
    { encoding: "base64", skipPreflight: false, preflightCommitment: "confirmed" },
  ]);
}
