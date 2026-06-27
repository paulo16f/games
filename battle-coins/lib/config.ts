const isProduction = process.env.NODE_ENV === "production";

function env(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name];
    if (value !== undefined && value !== "") return value;
  }
  return "";
}

function hasEnv(...names: string[]): boolean {
  return Boolean(env(...names));
}

function envNumber(defaultValue: number, ...names: string[]): number {
  const value = env(...names);
  if (!value) return defaultValue;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function envBool(defaultValue: boolean, ...names: string[]): boolean {
  const value = env(...names);
  if (!value) return defaultValue;
  return !["0", "false", "no", "off"].includes(value.toLowerCase());
}

function envList(...names: string[]): string[] {
  return env(...names)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export const toadJumpConfig = {
  tokenMint: env("TOAD_JUMP_TOKEN_MINT", "NEXT_PUBLIC_TOAD_JUMP_TOKEN_MINT", "RUNNING_TOADS_TOKEN_MINT", "NEXT_PUBLIC_RUNNING_TOADS_TOKEN_MINT"),
  tokenSymbol: env("NEXT_PUBLIC_TOAD_JUMP_TOKEN_SYMBOL", "TOAD_JUMP_TOKEN_SYMBOL", "NEXT_PUBLIC_RUNNING_TOADS_TOKEN_SYMBOL", "RUNNING_TOADS_TOKEN_SYMBOL") || "TOADJUMP",
  gateAmount: envNumber(10_000, "TOAD_JUMP_GATE_AMOUNT", "NEXT_PUBLIC_TOAD_JUMP_GATE_AMOUNT", "RUNNING_TOADS_GATE_AMOUNT", "NEXT_PUBLIC_RUNNING_TOADS_GATE_AMOUNT"),
  buyUrl: env("NEXT_PUBLIC_TOAD_JUMP_BUY_URL", "TOAD_JUMP_BUY_URL", "NEXT_PUBLIC_RUNNING_TOADS_BUY_URL", "RUNNING_TOADS_BUY_URL") || "#",
  rpcUrl: env("RPC_URL", "NEXT_PUBLIC_RPC_URL") || (isProduction ? "" : "https://api.devnet.solana.com"),
  mockTokenBalance: process.env.MOCK_TOKEN_BALANCE,
  treasuryPrivateKey: env("TREASURY_PRIVATE_KEY"),
  dailyTokenRewardAmount: envNumber(500, "DAILY_TOKEN_REWARD_AMOUNT"),
  dailyTokenRewardPool: envNumber(50_000, "DAILY_TOKEN_REWARD_POOL"),
  maxDailyTokenClaims: envNumber(1000, "MAX_DAILY_TOKEN_CLAIMS"),
  creatorDashboardKey: env("CREATOR_DASHBOARD_KEY"),
  treasuryWallet: env("TREASURY_WALLET"),
  tokenDecimals: envNumber(6, "TOAD_JUMP_TOKEN_DECIMALS", "RUNNING_TOADS_TOKEN_DECIMALS"),
  burnRateBps: envNumber(500, "BURN_RATE_BPS"),
  burnEnabled: envBool(true, "BURN_ENABLED"),
  minTokenClaimAmount: envNumber(100, "MIN_TOKEN_CLAIM_AMOUNT"),
  autoJumpIntervalMs: envNumber(5 * 60 * 1000, "AUTO_JUMP_INTERVAL_MS"),
  rewardClaimCooldownMs: envNumber(30 * 60 * 1000, "REWARD_CLAIM_COOLDOWN_MS"),
  kvRestApiUrl: env("KV_REST_API_URL"),
  kvRestApiToken: env("KV_REST_API_TOKEN"),
  cronSecret: env("CRON_SECRET"),
  sessionSecret: env("SESSION_SECRET"),
  rewardPayoutsEnabled: envBool(false, "REWARDS_PAYOUTS_ENABLED"),
  payoutCanaryWallets: envList("PAYOUT_CANARY_WALLETS"),
  maxPayoutPerClaim: envNumber(0, "MAX_PAYOUT_PER_CLAIM"),
  maxTotalDailyPayout: envNumber(0, "MAX_TOTAL_DAILY_PAYOUT"),
  isProduction,
};

export const toadJumpEnvPresence = {
  postgresUrl: hasEnv("POSTGRES_URL"),
  tokenMint: hasEnv("TOAD_JUMP_TOKEN_MINT", "NEXT_PUBLIC_TOAD_JUMP_TOKEN_MINT", "RUNNING_TOADS_TOKEN_MINT", "NEXT_PUBLIC_RUNNING_TOADS_TOKEN_MINT"),
  tokenSymbol: hasEnv("TOAD_JUMP_TOKEN_SYMBOL", "NEXT_PUBLIC_TOAD_JUMP_TOKEN_SYMBOL", "RUNNING_TOADS_TOKEN_SYMBOL", "NEXT_PUBLIC_RUNNING_TOADS_TOKEN_SYMBOL"),
  gateAmount: hasEnv("TOAD_JUMP_GATE_AMOUNT", "NEXT_PUBLIC_TOAD_JUMP_GATE_AMOUNT", "RUNNING_TOADS_GATE_AMOUNT", "NEXT_PUBLIC_RUNNING_TOADS_GATE_AMOUNT"),
  tokenDecimals: hasEnv("TOAD_JUMP_TOKEN_DECIMALS", "RUNNING_TOADS_TOKEN_DECIMALS"),
  buyUrl: hasEnv("NEXT_PUBLIC_TOAD_JUMP_BUY_URL", "TOAD_JUMP_BUY_URL", "NEXT_PUBLIC_RUNNING_TOADS_BUY_URL", "RUNNING_TOADS_BUY_URL"),
  rpcUrl: hasEnv("RPC_URL", "NEXT_PUBLIC_RPC_URL"),
};

export function localDevGateUnlocked(): boolean {
  return !toadJumpConfig.tokenMint && !toadJumpConfig.isProduction;
}

export function kvConfigured(): boolean {
  return Boolean(toadJumpConfig.kvRestApiUrl && toadJumpConfig.kvRestApiToken);
}

export class ProductionReadinessError extends Error {
  status = 503;

  constructor(message: string) {
    super(message);
    this.name = "ProductionReadinessError";
  }
}

export function assertProductionReadyConfig(): void {
  if (!toadJumpConfig.isProduction) return;
  const missing: string[] = [];
  if (!toadJumpEnvPresence.postgresUrl) missing.push("POSTGRES_URL");
  if (!toadJumpConfig.tokenMint) missing.push("TOAD_JUMP_TOKEN_MINT");
  if (!toadJumpEnvPresence.tokenSymbol) missing.push("TOAD_JUMP_TOKEN_SYMBOL");
  if (!toadJumpEnvPresence.gateAmount) missing.push("TOAD_JUMP_GATE_AMOUNT");
  if (!toadJumpEnvPresence.tokenDecimals) missing.push("TOAD_JUMP_TOKEN_DECIMALS");
  if (!toadJumpEnvPresence.buyUrl) missing.push("NEXT_PUBLIC_TOAD_JUMP_BUY_URL");
  if (!toadJumpConfig.rpcUrl) missing.push("RPC_URL");
  if (!toadJumpConfig.treasuryWallet) missing.push("TREASURY_WALLET");
  if (!toadJumpConfig.treasuryPrivateKey) missing.push("TREASURY_PRIVATE_KEY");
  if (!toadJumpConfig.cronSecret) missing.push("CRON_SECRET");
  if (!toadJumpConfig.creatorDashboardKey) missing.push("CREATOR_DASHBOARD_KEY");
  if (!toadJumpConfig.sessionSecret) missing.push("SESSION_SECRET");
  if (missing.length) {
    throw new ProductionReadinessError(`Missing production environment: ${missing.join(", ")}`);
  }
}
