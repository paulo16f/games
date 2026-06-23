const baseUrl = process.env.SMOKE_BASE_URL || "http://localhost:3000";
const wallet = process.env.SMOKE_WALLET || `local-smoke-${Date.now()}`;

async function request(path, options) {
  const res = await fetch(`${baseUrl}${path}`, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${path} failed with ${res.status}: ${data.error || JSON.stringify(data)}`);
  }
  return data;
}

async function action(name, extra = {}) {
  return request("/api/game/action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: name, wallet, ...extra }),
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const gate = await request(`/api/token/balance?wallet=${encodeURIComponent(wallet)}`);
assert(gate.gated === true, "local dev gate should unlock without a configured mint");

const firstInit = await action("init");
assert(firstInit.playerData.flies === 10, "new player should start with exactly 10 flies");
assert(firstInit.playerData.toads.length === 1, "new player should receive one starter toad");

const secondInit = await action("init");
assert(secondInit.playerData.flies === 10, "repeat init should not duplicate starter flies");
assert(secondInit.playerData.toads.length === 1, "repeat init should not duplicate starter toad");

let dailyBlockedWithoutActivity = false;
try {
  await action("claim_24h_reward");
} catch {
  dailyBlockedWithoutActivity = true;
}
assert(dailyBlockedWithoutActivity, "24h claim should require active jump score");

const egg = await action("open_egg");
assert(egg.result.egg.toad, "egg should return a toad result");
assert(!("tokenReward" in egg.result.egg), "egg should not return real-token rewards");

const race = await action("enter_race");
assert(race.result.race.rank >= 1 && race.result.race.rank <= 4, "race rank should be between 1 and 4");
assert(race.playerData.totalRaces === 1, "race should increment total races");
assert(typeof race.playerData.flies === "number", "flies should be a number after sprint cost");
assert(race.playerData.dailyJumpScore > 0, "sprint should count as active jump score");

let dailyPoolBlocked = false;
try {
  await action("claim_24h_reward");
} catch {
  dailyPoolBlocked = true;
}
assert(dailyPoolBlocked, "24h token claim should require a funded creator rewards pool");

const leaderboard = await request("/api/leaderboard");
assert(Array.isArray(leaderboard), "leaderboard should return an array");

const season = await request("/api/season");
assert(season.projectLedger.externalAmount === 0, "project ledger should not route rewards externally");
assert(season.currentWeekId, "season should expose the current week id");

let weeklyBlocked = false;
try {
  await action("claim_weekly_rewards");
} catch {
  weeklyBlocked = true;
}
assert(weeklyBlocked, "weekly rewards should not be claimable without a completed qualifying week");

console.log("Jump Frogs backend smoke checks passed.");
