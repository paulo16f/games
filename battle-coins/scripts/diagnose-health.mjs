const rawBaseUrl = process.env.DEPLOYED_BASE_URL || process.env.SMOKE_BASE_URL;

if (!rawBaseUrl) {
  throw new Error("Set DEPLOYED_BASE_URL=https://your-domain before running health:deployed");
}

const baseUrl = rawBaseUrl.replace(/\/$/, "");

const advice = {
  postgres: "Set POSTGRES_URL in Vercel Production and attach a reachable Postgres database.",
  dbReady: "Check POSTGRES_URL and Vercel logs; schema creation must succeed in production.",
  rpc: "Set RPC_URL or NEXT_PUBLIC_RPC_URL in Vercel Production.",
  rpcLive: "Use a live mainnet RPC endpoint with enough quota. Avoid devnet/testnet for production.",
  tokenMint: "Set TOAD_JUMP_TOKEN_MINT to the final Pump.fun mint address.",
  mintAccount: "Confirm the mint exists on mainnet and that RPC_URL points at mainnet.",
  mintTokenProgram: "Confirm the configured mint is an SPL token mint owned by the token program this app supports.",
  tokenSymbol: "Set TOAD_JUMP_TOKEN_SYMBOL in Vercel Production.",
  gateAmount: "Set TOAD_JUMP_GATE_AMOUNT in Vercel Production.",
  tokenDecimals: "Set TOAD_JUMP_TOKEN_DECIMALS to the mint decimals.",
  buyUrl: "Set NEXT_PUBLIC_TOAD_JUMP_BUY_URL to the Pump.fun coin page.",
  treasuryWallet: "Set TREASURY_WALLET to the public wallet that receives token spends.",
  treasuryTokenAccount: "Create or fund the treasury token account for the configured mint.",
  treasuryPrivateKey: "Set TREASURY_PRIVATE_KEY in Vercel Production. Do not expose it as NEXT_PUBLIC_*.",
  cronSecret: "Set CRON_SECRET in Vercel Production.",
  creatorDashboardKey: "Set CREATOR_DASHBOARD_KEY in Vercel Production.",
  sessionSecret: "Set SESSION_SECRET in Vercel Production with `npm.cmd run secret:session`.",
  payoutTransport: "Keep REWARDS_PAYOUTS_ENABLED=false until a clean SPL payout signer is installed.",
};

const requiredChecks = new Set([
  "postgres",
  "dbReady",
  "rpc",
  "rpcLive",
  "tokenMint",
  "mintAccount",
  "mintTokenProgram",
  "tokenSymbol",
  "gateAmount",
  "tokenDecimals",
  "buyUrl",
  "treasuryWallet",
  "treasuryTokenAccount",
  "treasuryPrivateKey",
  "cronSecret",
  "creatorDashboardKey",
  "sessionSecret",
  "payoutTransport",
]);

function formatValue(value) {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (value === null || value === undefined) return "missing";
  return String(value);
}

function checkFailed(key, value) {
  if (!requiredChecks.has(key)) return false;
  return value === false || value === 0 || value === "" || value === null || value === undefined;
}

async function main() {
  const url = `${baseUrl}/api/health`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  const data = await res.json().catch(() => ({}));
  const checks = data.checks && typeof data.checks === "object" ? data.checks : {};

  console.log(`Health URL: ${url}`);
  console.log(`HTTP status: ${res.status}`);
  console.log(`Environment: ${data.environment || "unknown"}`);
  console.log(`Payout mode: ${data.payoutMode || "unknown"}`);
  console.log(`Overall: ${data.ok ? "ok" : "not ready"}`);

  if (data.error) {
    console.log(`Error: ${data.error}`);
  }

  const failed = Object.entries(checks)
    .filter(([key, value]) => checkFailed(key, value))
    .map(([key, value]) => ({ key, value }));

  if (!failed.length && data.ok) {
    console.log("All required health checks are green.");
    return;
  }

  console.log("");
  console.log("Checks:");
  for (const [key, value] of Object.entries(checks)) {
    const marker = checkFailed(key, value) ? "x" : "ok";
    console.log(`- ${marker} ${key}: ${formatValue(value)}`);
  }

  if (failed.length) {
    console.log("");
    console.log("Next fixes:");
    for (const { key } of failed) {
      console.log(`- ${key}: ${advice[key] || "Inspect Vercel env and server logs for this check."}`);
    }
  }

  process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
