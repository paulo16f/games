import { NextResponse } from "next/server";
import { assertProductionReadyConfig, toadJumpConfig, toadJumpEnvPresence } from "@/lib/config";
import { ensureSchema, pgConfigured } from "@/lib/db";
import { normalizePublicKey, rpcCall, SPL_TOKEN_PROGRAM_ID } from "@/lib/solana-lite";

export const dynamic = "force-dynamic";

function present(value: unknown): boolean {
  return Boolean(value);
}

interface MintAccountInfo {
  value: {
    owner?: string;
  } | null;
}

interface TokenAccounts {
  value: Array<{ pubkey: string }>;
}

async function solanaReadinessChecks(): Promise<{
  rpcLive: boolean;
  mintAccount: boolean;
  mintTokenProgram: boolean;
  treasuryTokenAccount: boolean;
  error: string;
}> {
  if (!toadJumpConfig.rpcUrl) {
    return { rpcLive: false, mintAccount: false, mintTokenProgram: false, treasuryTokenAccount: false, error: "" };
  }

  let rpcLive = false;
  let mintAccount = false;
  let mintTokenProgram = false;
  let treasuryTokenAccount = false;
  const errors: string[] = [];

  try {
    await rpcCall(toadJumpConfig.rpcUrl, "getLatestBlockhash", [{ commitment: "confirmed" }]);
    rpcLive = true;
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "RPC liveness check failed");
  }

  let mint = "";
  let treasuryWallet = "";
  try {
    mint = toadJumpConfig.tokenMint ? normalizePublicKey(toadJumpConfig.tokenMint) : "";
  } catch {
    errors.push("TOAD_JUMP_TOKEN_MINT is not a valid Solana public key");
  }
  try {
    treasuryWallet = toadJumpConfig.treasuryWallet ? normalizePublicKey(toadJumpConfig.treasuryWallet) : "";
  } catch {
    errors.push("TREASURY_WALLET is not a valid Solana public key");
  }

  if (rpcLive && mint) {
    try {
      const account = await rpcCall<MintAccountInfo>(toadJumpConfig.rpcUrl, "getAccountInfo", [
        mint,
        { commitment: "confirmed" },
      ]);
      mintAccount = Boolean(account.value);
      mintTokenProgram = account.value?.owner === SPL_TOKEN_PROGRAM_ID;
      if (!mintAccount) errors.push("TOAD_JUMP_TOKEN_MINT account was not found on RPC");
      else if (!mintTokenProgram) errors.push("TOAD_JUMP_TOKEN_MINT is not owned by the SPL token program used by token spends");
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Mint account check failed");
    }
  }

  if (rpcLive && mint && treasuryWallet) {
    try {
      const accounts = await rpcCall<TokenAccounts>(toadJumpConfig.rpcUrl, "getTokenAccountsByOwner", [
        treasuryWallet,
        { mint },
        { encoding: "jsonParsed", commitment: "confirmed" },
      ]);
      treasuryTokenAccount = accounts.value.length > 0;
      if (!treasuryTokenAccount) errors.push("Treasury token account for TOAD_JUMP_TOKEN_MINT was not found");
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Treasury token account check failed");
    }
  }

  return { rpcLive, mintAccount, mintTokenProgram, treasuryTokenAccount, error: errors.join("; ") };
}

export async function GET() {
  const runLiveSolanaChecks = toadJumpConfig.isProduction || process.env.HEALTH_LIVE_RPC_CHECKS === "true";
  const solana = runLiveSolanaChecks
    ? await solanaReadinessChecks()
    : { rpcLive: !toadJumpConfig.isProduction, mintAccount: !toadJumpConfig.isProduction, mintTokenProgram: !toadJumpConfig.isProduction, treasuryTokenAccount: !toadJumpConfig.isProduction, error: "" };
  const checks = {
    postgres: toadJumpEnvPresence.postgresUrl && pgConfigured(),
    rpc: toadJumpEnvPresence.rpcUrl && present(toadJumpConfig.rpcUrl),
    rpcLive: solana.rpcLive,
    tokenMint: toadJumpEnvPresence.tokenMint && present(toadJumpConfig.tokenMint),
    mintAccount: solana.mintAccount,
    mintTokenProgram: solana.mintTokenProgram,
    tokenSymbol: toadJumpEnvPresence.tokenSymbol,
    gateAmount: toadJumpEnvPresence.gateAmount,
    tokenDecimals: toadJumpEnvPresence.tokenDecimals,
    buyUrl: toadJumpEnvPresence.buyUrl,
    treasuryWallet: present(toadJumpConfig.treasuryWallet),
    treasuryTokenAccount: solana.treasuryTokenAccount,
    treasuryPrivateKey: present(toadJumpConfig.treasuryPrivateKey),
    cronSecret: present(toadJumpConfig.cronSecret),
    creatorDashboardKey: present(toadJumpConfig.creatorDashboardKey),
    sessionSecret: present(toadJumpConfig.sessionSecret) || !toadJumpConfig.isProduction,
    payoutsEnabled: toadJumpConfig.rewardPayoutsEnabled,
    payoutTransport: !toadJumpConfig.rewardPayoutsEnabled,
    payoutCanaryWallets: toadJumpConfig.payoutCanaryWallets.length,
    maxPayoutPerClaim: toadJumpConfig.maxPayoutPerClaim,
    maxTotalDailyPayout: toadJumpConfig.maxTotalDailyPayout,
    tokenSpendIntents: Boolean(toadJumpConfig.rpcUrl && toadJumpConfig.tokenMint && toadJumpConfig.treasuryWallet),
  };

  let dbReady = false;
  let error = "";
  try {
    assertProductionReadyConfig();
    await ensureSchema();
    dbReady = true;
  } catch (err) {
    error = err instanceof Error ? err.message : "Health check failed";
  }
  if (solana.error) {
    error = [error, solana.error].filter(Boolean).join("; ");
  }

  const requiredBooleans = [
    checks.postgres,
    checks.rpc,
    checks.rpcLive,
    checks.tokenMint,
    checks.mintAccount,
    checks.mintTokenProgram,
    checks.tokenSymbol,
    checks.gateAmount,
    checks.tokenDecimals,
    checks.buyUrl,
    checks.treasuryWallet,
    checks.treasuryTokenAccount,
    checks.treasuryPrivateKey,
    checks.cronSecret,
    checks.creatorDashboardKey,
    checks.sessionSecret,
    checks.payoutTransport,
  ];
  const ok = requiredBooleans.every(Boolean) && dbReady;

  return NextResponse.json(
    {
      ok,
      environment: toadJumpConfig.isProduction ? "production" : "development",
      checks: { ...checks, dbReady },
      payoutMode: toadJumpConfig.rewardPayoutsEnabled ? "blocked-missing-clean-transport" : "accounting-only",
      error,
    },
    { status: ok ? 200 : 503 }
  );
}
