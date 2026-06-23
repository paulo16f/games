/**
 * Send tokens from the treasury to a tester wallet.
 *
 * Usage:
 *   node scripts/send-test-tokens.mjs <RECIPIENT_WALLET> [AMOUNT]
 *
 * Examples:
 *   node scripts/send-test-tokens.mjs 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU
 *   node scripts/send-test-tokens.mjs 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU 1000
 *
 * Reads:
 *   - Treasury keypair from ./treasury-devnet.json
 *   - Token mint from JUMP_FROGS_TOKEN_MINT in .env.local or as JUMP_FROGS_TOKEN_MINT env var
 */

import { Connection, Keypair, PublicKey, clusterApiUrl } from "@solana/web3.js";
import { getOrCreateAssociatedTokenAccount, transfer } from "@solana/spl-token";
import { readFileSync, existsSync } from "fs";

const DEVNET_RPC = clusterApiUrl("devnet");
const DECIMALS = 6;
const KEYPAIR_PATH = "./treasury-devnet.json";

// --- parse args ---
const recipient = process.argv[2];
const amount = Number(process.argv[3] ?? 1);

if (!recipient) {
  console.error("Usage: node scripts/send-test-tokens.mjs <RECIPIENT_WALLET> [AMOUNT]");
  process.exit(1);
}
if (!Number.isFinite(amount) || amount <= 0) {
  console.error("Amount must be a positive number.");
  process.exit(1);
}

// --- load .env.local manually (Next.js doesn't load it in plain node) ---
let tokenMint = process.env.JUMP_FROGS_TOKEN_MINT ?? "";
if (!tokenMint && existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const [k, ...rest] = line.split("=");
    if (k?.trim() === "JUMP_FROGS_TOKEN_MINT") {
      tokenMint = rest.join("=").trim();
    }
  }
}
if (!tokenMint) {
  console.error("JUMP_FROGS_TOKEN_MINT not set. Add it to .env.local or set as env var.");
  process.exit(1);
}

// --- load treasury keypair ---
if (!existsSync(KEYPAIR_PATH)) {
  console.error(`${KEYPAIR_PATH} not found. Run npm run setup:devnet first.`);
  process.exit(1);
}
const treasury = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(readFileSync(KEYPAIR_PATH, "utf8")))
);

console.log(`Sending ${amount} token(s) to ${recipient}...`);
console.log(`  From: ${treasury.publicKey.toBase58()}`);
console.log(`  Mint: ${tokenMint}\n`);

const connection = new Connection(DEVNET_RPC, "confirmed");
const mint = new PublicKey(tokenMint);
let recipientPubkey;
try {
  recipientPubkey = new PublicKey(recipient);
} catch {
  console.error("Invalid recipient wallet address.");
  process.exit(1);
}

// Get/create source ATA (treasury)
const sourceATA = await getOrCreateAssociatedTokenAccount(
  connection, treasury, mint, treasury.publicKey
);

// Get/create destination ATA (recipient) — treasury pays for account creation
const destATA = await getOrCreateAssociatedTokenAccount(
  connection, treasury, mint, recipientPubkey
);

// Transfer
const rawAmount = BigInt(Math.round(amount * 10 ** DECIMALS));
const sig = await transfer(
  connection,
  treasury,
  sourceATA.address,
  destATA.address,
  treasury,
  rawAmount
);

console.log(`✓ Sent ${amount} token(s)`);
console.log(`  Signature: ${sig}`);
console.log(`  Explorer: https://explorer.solana.com/tx/${sig}?cluster=devnet`);

process.exit(0);
