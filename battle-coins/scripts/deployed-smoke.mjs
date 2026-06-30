const rawBaseUrl = process.env.DEPLOYED_BASE_URL || process.env.SMOKE_BASE_URL;

if (!rawBaseUrl) {
  throw new Error("Set DEPLOYED_BASE_URL=https://your-domain before running smoke:deployed");
}

const baseUrl = rawBaseUrl.replace(/\/$/, "");
const creatorKey = process.env.CREATOR_DASHBOARD_KEY || "";

async function request(path, options = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "accept": "application/json",
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertNoPrivateProjectLedger(label, ledger) {
  assert(ledger && typeof ledger === "object", `${label} should include a public project ledger subset`);
  assert("dailyActivePool" in ledger, `${label} should include dailyActivePool`);
  assert("racePool" in ledger, `${label} should include racePool`);
  for (const privateKey of [
    "creatorRewardsRecorded",
    "creatorRewardsSolRecorded",
    "totalReturnedToProject",
    "developmentPool",
    "lastProcessedSignature",
    "autoSyncCount",
  ]) {
    assert(!(privateKey in ledger), `${label} must not expose ${privateKey}`);
  }
}

const health = await request("/api/health");
assert(health.res.status === 200, `/api/health should return 200, got ${health.res.status}: ${health.data.error || ""}`);
assert(health.data.ok === true, `/api/health ok must be true: ${health.data.error || JSON.stringify(health.data.checks || {})}`);
for (const check of [
  "postgres",
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
  "dbReady",
]) {
  assert(Boolean(health.data.checks?.[check]), `/api/health checks.${check} must be true`);
}
assert(health.data.payoutMode === "accounting-only", "public launch must keep payouts accounting-only");

for (const path of ["/api/leaderboard", "/api/races/current", "/api/races/leaderboard", "/api/seasons/history"]) {
  const response = await request(path);
  assert(response.res.ok, `${path} should be public and healthy, got ${response.res.status}`);
}

const meta = await request("/api/meta");
assert(meta.res.ok, `/api/meta should be public, got ${meta.res.status}`);
assert(!("creatorDashboard" in meta.data), "/api/meta must not expose creatorDashboard");
assertNoPrivateProjectLedger("/api/meta season.projectLedger", meta.data.season?.projectLedger);

const season = await request("/api/season");
assert(season.res.ok, `/api/season should be public, got ${season.res.status}`);
assertNoPrivateProjectLedger("/api/season projectLedger", season.data.projectLedger);

const noKeyDashboard = await request("/api/creator/dashboard");
assert(noKeyDashboard.res.status === 401, `creator dashboard without key should be 401, got ${noKeyDashboard.res.status}`);

const queryKeyDashboard = await request("/api/creator/dashboard?key=definitely-wrong");
assert(queryKeyDashboard.res.status === 401, `creator dashboard query key should be rejected, got ${queryKeyDashboard.res.status}`);

const wrongKeyDashboard = await request("/api/creator/dashboard", {
  headers: { "x-creator-key": "definitely-wrong" },
});
assert(wrongKeyDashboard.res.status === 401, `creator dashboard wrong header key should be 401, got ${wrongKeyDashboard.res.status}`);

if (creatorKey) {
  const creatorDashboard = await request("/api/creator/dashboard", {
    headers: { "x-creator-key": creatorKey },
  });
  assert(creatorDashboard.res.ok, `creator dashboard valid header key should pass, got ${creatorDashboard.res.status}`);
  assert(creatorDashboard.data.ledger, "creator dashboard should include private ledger after valid header auth");
}

for (const cronPath of ["/api/cron/creator-rewards", "/api/cron/settle-races"]) {
  const missingAuth = await request(cronPath);
  assert(missingAuth.res.status === 401, `${cronPath} without auth should be 401, got ${missingAuth.res.status}`);
  const wrongAuth = await request(cronPath, {
    headers: { authorization: "Bearer definitely-wrong" },
  });
  assert(wrongAuth.res.status === 401, `${cronPath} with wrong auth should be 401, got ${wrongAuth.res.status}`);
}

console.log("Toad Jump deployed smoke checks passed.");
