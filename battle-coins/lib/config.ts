export const toadJumpConfig = {
  tokenMint:
    process.env.TOAD_JUMP_TOKEN_MINT ||
    process.env.NEXT_PUBLIC_TOAD_JUMP_TOKEN_MINT ||
    "",
  tokenSymbol:
    process.env.NEXT_PUBLIC_TOAD_JUMP_TOKEN_SYMBOL ||
    process.env.TOAD_JUMP_TOKEN_SYMBOL ||
    "TOADJUMP",
  gateAmount: Number(
    process.env.TOAD_JUMP_GATE_AMOUNT ||
      process.env.NEXT_PUBLIC_TOAD_JUMP_GATE_AMOUNT ||
      10_000
  ),
  buyUrl:
    process.env.NEXT_PUBLIC_TOAD_JUMP_BUY_URL ||
    process.env.TOAD_JUMP_BUY_URL ||
    "#",
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com",
  mockTokenBalance: process.env.MOCK_TOKEN_BALANCE,
  treasuryPrivateKey: process.env.TREASURY_PRIVATE_KEY || "",
  dailyTokenRewardAmount: Number(process.env.DAILY_TOKEN_REWARD_AMOUNT || 500),
  dailyTokenRewardPool: Number(process.env.DAILY_TOKEN_REWARD_POOL || 50_000),
  maxDailyTokenClaims: Number(process.env.MAX_DAILY_TOKEN_CLAIMS || 1000),
  creatorDashboardKey: process.env.CREATOR_DASHBOARD_KEY || "",
  treasuryWallet: process.env.TREASURY_WALLET || "",
  tokenDecimals: Number(process.env.TOAD_JUMP_TOKEN_DECIMALS || 6),
  burnRateBps: Number(process.env.BURN_RATE_BPS || 500),
  burnEnabled: (process.env.BURN_ENABLED ?? "true") !== "false",
  minTokenClaimAmount: Number(process.env.MIN_TOKEN_CLAIM_AMOUNT || 100),
  autoJumpIntervalMs: Number(process.env.AUTO_JUMP_INTERVAL_MS || 5 * 60 * 1000),
  rewardClaimCooldownMs: Number(process.env.REWARD_CLAIM_COOLDOWN_MS || 30 * 60 * 1000),
  kvRestApiUrl: process.env.KV_REST_API_URL || "",
  kvRestApiToken: process.env.KV_REST_API_TOKEN || "",
  cronSecret: process.env.CRON_SECRET || "",
  isProduction: process.env.NODE_ENV === "production",
};

export function localDevGateUnlocked(): boolean {
  return !toadJumpConfig.tokenMint && !toadJumpConfig.isProduction;
}

export function kvConfigured(): boolean {
  return Boolean(toadJumpConfig.kvRestApiUrl && toadJumpConfig.kvRestApiToken);
}
