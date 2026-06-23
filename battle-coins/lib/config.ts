export const jumpFrogsConfig = {
  tokenMint:
    process.env.JUMP_FROGS_TOKEN_MINT ||
    process.env.NEXT_PUBLIC_JUMP_FROGS_TOKEN_MINT ||
    "",
  tokenSymbol:
    process.env.NEXT_PUBLIC_JUMP_FROGS_TOKEN_SYMBOL ||
    process.env.JUMP_FROGS_TOKEN_SYMBOL ||
    "JFROGS",
  gateAmount: Number(
    process.env.JUMP_FROGS_GATE_AMOUNT ||
      process.env.NEXT_PUBLIC_JUMP_FROGS_GATE_AMOUNT ||
      250_000
  ),
  buyUrl:
    process.env.NEXT_PUBLIC_JUMP_FROGS_BUY_URL ||
    process.env.JUMP_FROGS_BUY_URL ||
    "#",
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com",
  mockTokenBalance: process.env.MOCK_TOKEN_BALANCE,
  treasuryPrivateKey: process.env.TREASURY_PRIVATE_KEY || "",
  dailyTokenRewardAmount: Number(process.env.DAILY_TOKEN_REWARD_AMOUNT || 100),
  dailyTokenRewardPool: Number(process.env.DAILY_TOKEN_REWARD_POOL || 100_000),
  maxDailyTokenClaims: Number(process.env.MAX_DAILY_TOKEN_CLAIMS || 1000),
  creatorDashboardKey: process.env.CREATOR_DASHBOARD_KEY || "",
  treasuryWallet: process.env.TREASURY_WALLET || "",
  tokenDecimals: Number(process.env.JUMP_FROGS_TOKEN_DECIMALS || 6),
  burnRateBps: Number(process.env.BURN_RATE_BPS || 1000),
  burnEnabled: (process.env.BURN_ENABLED ?? "true") !== "false",
  minTokenClaimAmount: Number(process.env.MIN_TOKEN_CLAIM_AMOUNT || 1),
  autoJumpIntervalMs: Number(process.env.AUTO_JUMP_INTERVAL_MS || 12 * 60 * 1000),
  kvRestApiUrl: process.env.KV_REST_API_URL || "",
  kvRestApiToken: process.env.KV_REST_API_TOKEN || "",
  isProduction: process.env.NODE_ENV === "production",
};

export function localDevGateUnlocked(): boolean {
  return !jumpFrogsConfig.tokenMint && !jumpFrogsConfig.isProduction;
}

export function kvConfigured(): boolean {
  return Boolean(jumpFrogsConfig.kvRestApiUrl && jumpFrogsConfig.kvRestApiToken);
}
