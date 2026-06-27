import bs58 from "bs58";
import nacl from "tweetnacl";

const baseUrl = process.env.SMOKE_BASE_URL || "http://localhost:3000";
const keypair = nacl.sign.keyPair();
const wallet = bs58.encode(keypair.publicKey);
let cookie = "";

async function rawRequest(path, options = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(options.headers || {}),
    },
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

async function request(path, options) {
  const { res, data } = await rawRequest(path, options);
  if (!res.ok) {
    throw new Error(`${path} failed with ${res.status}: ${data.error || JSON.stringify(data)}`);
  }
  return data;
}

async function expectFailure(path, options, message) {
  const { res } = await rawRequest(path, options);
  if (res.ok) throw new Error(message);
}

async function signIn(activeKeypair = keypair) {
  const activeWallet = bs58.encode(activeKeypair.publicKey);
  const nonce = await request("/api/auth/nonce", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallet: activeWallet }),
  });
  const messageBytes = new TextEncoder().encode(nonce.message);
  const signature = nacl.sign.detached(messageBytes, activeKeypair.secretKey);
  const verify = await request("/api/auth/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      wallet: activeWallet,
      nonce: nonce.nonce,
      message: nonce.message,
      signature: Array.from(signature),
    }),
  });
  return { nonce, verify };
}

async function action(name, extra = {}) {
  return request("/api/game/action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: name, ...extra }),
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const invalidNonce = await request("/api/auth/nonce", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ wallet }),
});
await expectFailure(
  "/api/auth/verify",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      wallet,
      nonce: invalidNonce.nonce,
      message: invalidNonce.message,
      signature: Array.from(new Uint8Array(64)),
    }),
  },
  "invalid signature should fail",
);

const { nonce, verify } = await signIn();
assert(verify.wallet === wallet, "verified wallet should match signed wallet");
assert(verify.gate.gated === true, "local dev gate should unlock without a configured mint");

await expectFailure(
  "/api/auth/verify",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      wallet,
      nonce: nonce.nonce,
      message: nonce.message,
      signature: Array.from(nacl.sign.detached(new TextEncoder().encode(nonce.message), keypair.secretKey)),
    }),
  },
  "nonce replay should fail",
);

const session = await request("/api/auth/session");
assert(session.authenticated === true, "session should authenticate after SIWS verify");
assert(session.wallet === wallet, "session wallet should match signed wallet");

const firstInit = await action("init");
assert(firstInit.playerData.wallet === wallet, "server should mutate the authenticated session wallet");
assert(firstInit.playerData.flies === 10, "new player should start with exactly 10 flies");
assert(firstInit.playerData.toads.length === 0, "new player should hatch their first frog from an egg");

const maliciousWallet = bs58.encode(nacl.sign.keyPair().publicKey);
const mismatch = await request("/api/game/action", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ action: "init", wallet: maliciousWallet }),
});
assert(mismatch.playerData.wallet === wallet, "client-submitted wallet must not override session wallet");

const secondInit = await action("init");
assert(secondInit.playerData.flies === 10, "repeat init should not duplicate starter flies");
assert(secondInit.playerData.toads.length === 0, "repeat init should not duplicate starter frogs");

let dailyBlockedWithoutActivity = false;
try {
  await action("claim_24h_reward");
} catch {
  dailyBlockedWithoutActivity = true;
}
assert(dailyBlockedWithoutActivity, "24h claim should require active jump score");

let directSkipBlocked = false;
try {
  await action("claim_flies_skip");
} catch {
  directSkipBlocked = true;
}
assert(directSkipBlocked, "claim timer skip must require a verified on-chain payment intent");

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

console.log("Toad Jump backend smoke checks passed.");
