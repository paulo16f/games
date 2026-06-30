const baseUrl = process.env.SMOKE_BASE_URL || "http://localhost:3000";
const creatorKey = process.env.CREATOR_DASHBOARD_KEY || "creator-smoke-secret";

async function request(path, options = {}) {
  const res = await fetch(`${baseUrl}${path}`, options);
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const meta = await request("/api/meta");
assert(meta.res.ok, "/api/meta should be public");
assert(!("creatorDashboard" in meta.data), "/api/meta must not expose creatorDashboard");
assert(meta.data.season?.projectLedger, "/api/meta should include a public project ledger subset");
assert("dailyActivePool" in meta.data.season.projectLedger, "public ledger should include dailyActivePool");
assert("racePool" in meta.data.season.projectLedger, "public ledger should include racePool");
assert(!("treasuryPrivateKey" in meta.data.season.projectLedger), "public ledger must not expose private config");
assert(!("creatorRewardsRecorded" in meta.data.season.projectLedger), "public ledger must not expose creator accounting");

const season = await request("/api/season");
assert(season.res.ok, "/api/season should be public");
assert("dailyActivePool" in season.data.projectLedger, "public season ledger should include dailyActivePool");
assert("racePool" in season.data.projectLedger, "public season ledger should include racePool");
assert(!("creatorRewardsRecorded" in season.data.projectLedger), "public season must not expose creator accounting");
assert(!("totalReturnedToProject" in season.data.projectLedger), "public season must not expose private project accounting");

const noKey = await request("/api/creator/dashboard");
assert(noKey.res.status === 401, `dashboard without key should be 401, got ${noKey.res.status}`);

const queryKey = await request(`/api/creator/dashboard?key=${encodeURIComponent(creatorKey)}`);
assert(queryKey.res.status === 401, `dashboard query key should be rejected, got ${queryKey.res.status}`);

const wrongKey = await request("/api/creator/dashboard", {
  headers: { "x-creator-key": "wrong-key" },
});
assert(wrongKey.res.status === 401, `dashboard wrong key should be 401, got ${wrongKey.res.status}`);

const headerKey = await request("/api/creator/dashboard", {
  headers: { "x-creator-key": creatorKey },
});
assert(headerKey.res.ok, `dashboard header key should pass, got ${headerKey.res.status}`);
assert(headerKey.data.ledger, "creator dashboard should include private ledger after header auth");

console.log("Toad Jump creator auth smoke checks passed.");
