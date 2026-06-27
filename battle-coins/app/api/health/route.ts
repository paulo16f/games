import { NextResponse } from "next/server";
import { assertProductionReadyConfig, toadJumpConfig, toadJumpEnvPresence } from "@/lib/config";
import { ensureSchema, pgConfigured } from "@/lib/db";

export const dynamic = "force-dynamic";

function present(value: unknown): boolean {
  return Boolean(value);
}

export async function GET() {
  const checks = {
    postgres: toadJumpEnvPresence.postgresUrl && pgConfigured(),
    rpc: toadJumpEnvPresence.rpcUrl && present(toadJumpConfig.rpcUrl),
    tokenMint: toadJumpEnvPresence.tokenMint && present(toadJumpConfig.tokenMint),
    tokenSymbol: toadJumpEnvPresence.tokenSymbol,
    gateAmount: toadJumpEnvPresence.gateAmount,
    tokenDecimals: toadJumpEnvPresence.tokenDecimals,
    buyUrl: toadJumpEnvPresence.buyUrl,
    treasuryWallet: present(toadJumpConfig.treasuryWallet),
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

  const requiredBooleans = [
    checks.postgres,
    checks.rpc,
    checks.tokenMint,
    checks.tokenSymbol,
    checks.gateAmount,
    checks.tokenDecimals,
    checks.buyUrl,
    checks.treasuryWallet,
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
