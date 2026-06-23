/**
 * Setup script: creates a Toad Jump SPL token on Solana devnet.
 * Run once before deploying to Vercel, or re-run after manually funding.
 *
 * Usage:
 *   node scripts/setup-devnet-token.mjs
 *
 * If the airdrop step fails, fund the treasury manually:
 *   https://faucet.solana.com  (paste the printed public key, request 2 SOL)
 * Then re-run this script — it will detect the existing keypair and continue.
 *
 * Output:
 *   treasury-devnet.json  — keypair file  ← ADD TO .gitignore
 *   Prints all Vercel env vars to paste into the dashboard.
 */

import { Connection, Keypair, clusterApiUrl, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { createMint, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { writeFileSync, readFileSync, existsSync } from "fs";

const DEVNET_RPC = clusterApiUrl("devnet");
const DECIMALS = 6;
const INITIAL_SUPPLY = 10_000_000; // 10M tokens
const MIN_SOL = 0.5 * LAMPORTS_PER_SOL;
const KEYPAIR_PATH = "./treasury-devnet.json";

console.log("=== Toad Jump Devnet Token Setup ===\n");

const connection = new Connection(DEVNET_RPC, "confirmed");

// Load existing keypair or generate a new one
let treasury;
if (existsSync(KEYPAIR_PATH)) {
  const bytes = JSON.parse(readFileSync(KEYPAIR_PATH, "utf8"));
  treasury = Keypair.fromSecretKey(Uint8Array.from(bytes));
  console.log(`✓ Loaded existing keypair from ${KEYPAIR_PATH}`);
} else {
  treasury = Keypair.generate();
  writeFileSync(KEYPAIR_PATH, JSON.stringify(Array.from(treasury.secretKey)));
  console.log(`✓ New treasury keypair saved to ${KEYPAIR_PATH}`);
}
console.log(`  Public key: ${treasury.publicKey.toBase58()}\n`);

// Check current SOL balance
let balance = await connection.getBalance(treasury.publicKey);
console.log(`  Current balance: ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);

// Try airdrop only if balance is low
if (balance < MIN_SOL) {
  console.log("  Balance too low — attempting devnet airdrop...");
  try {
    const sig = await connection.requestAirdrop(treasury.publicKey, 2 * LAMPORTS_PER_SOL);
    // Poll for confirmation instead of using subscription (avoids UV_HANDLE_CLOSING on Windows)
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const status = await connection.getSignatureStatus(sig);
      const conf = status.value?.confirmationStatus;
      if (conf === "confirmed" || conf === "finalized") break;
    }
    balance = await connection.getBalance(treasury.publicKey);
    console.log(`✓ Airdrop confirmed — balance: ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL\n`);
  } catch {
    balance = await connection.getBalance(treasury.publicKey);
  }
}

if (balance < MIN_SOL) {
  console.error("✗ Treasury needs at least 0.5 SOL to pay for transaction fees.\n");
  console.error("  Fund it manually, then re-run this script:");
  console.error("  1. Go to https://faucet.solana.com");
  console.error(`  2. Paste: ${treasury.publicKey.toBase58()}`);
  console.error("  3. Request 2 SOL");
  console.error("  4. Run: npm run setup:devnet\n");
  process.exit(1);
}

// Create the SPL token mint
console.log("Creating SPL token mint (6 decimals)...");
let mint;
try {
  mint = await createMint(
    connection,
    treasury,           // payer
    treasury.publicKey, // mint authority
    null,               // freeze authority (none)
    DECIMALS
  );
  console.log(`✓ Mint: ${mint.toBase58()}\n`);
} catch (err) {
  console.error("✗ Failed to create mint:", err.message);
  process.exit(1);
}

// Create treasury token account and mint initial supply
console.log(`Minting ${INITIAL_SUPPLY.toLocaleString()} tokens to treasury...`);
try {
  const treasuryATA = await getOrCreateAssociatedTokenAccount(
    connection,
    treasury,
    mint,
    treasury.publicKey
  );
  await mintTo(
    connection,
    treasury,
    mint,
    treasuryATA.address,
    treasury,
    BigInt(INITIAL_SUPPLY) * BigInt(10 ** DECIMALS)
  );
  console.log(`✓ Minted to: ${treasuryATA.address.toBase58()}\n`);
} catch (err) {
  console.error("✗ Failed to mint tokens:", err.message);
  process.exit(1);
}

const privateKeyJson = JSON.stringify(Array.from(treasury.secretKey));

console.log("=".repeat(62));
console.log("SUCCESS — paste these into Vercel → Settings → Env Variables:");
console.log("=".repeat(62));
console.log();
console.log(`NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com`);
console.log(`TOAD_JUMP_TOKEN_MINT=${mint.toBase58()}`);
console.log(`TOAD_JUMP_GATE_AMOUNT=1`);
console.log(`TREASURY_WALLET=${treasury.publicKey.toBase58()}`);
console.log(`TREASURY_PRIVATE_KEY=${privateKeyJson}`);
console.log(`BURN_ENABLED=false`);
console.log(`DAILY_TOKEN_REWARD_POOL=100000`);
console.log(`DAILY_TOKEN_REWARD_AMOUNT=100`);
console.log();
console.log("Generate secrets (run each in a terminal):");
console.log('  CRON_SECRET: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
console.log("  CREATOR_DASHBOARD_KEY: any secret string you choose");
console.log();
console.log("Also add Vercel KV (project dashboard → Storage → Create KV).");
console.log("KV_REST_API_URL and KV_REST_API_TOKEN will be added automatically.");
console.log();
console.log(`⚠️  ${KEYPAIR_PATH} and TREASURY_PRIVATE_KEY above contain your private key.`);
console.log("    Add treasury-devnet.json to .gitignore and never commit it.");

// Force clean exit — prevents UV_HANDLE_CLOSING crash on Windows
// caused by Solana's internal WebSocket not being closed
process.exit(0);
