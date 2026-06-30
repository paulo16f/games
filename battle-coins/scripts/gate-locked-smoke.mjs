import nacl from "tweetnacl";
import bs58 from "bs58";

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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function signIn() {
  const nonce = await request("/api/auth/nonce", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallet }),
  });
  const signature = nacl.sign.detached(new TextEncoder().encode(nonce.message), keypair.secretKey);
  return request("/api/auth/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      wallet,
      nonce: nonce.nonce,
      message: nonce.message,
      signature: Array.from(signature),
    }),
  });
}

async function action(name, extra = {}) {
  return rawRequest("/api/game/action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: name, ...extra }),
  });
}

const verify = await signIn();
assert(verify.wallet === wallet, "verified wallet should match signed wallet");
assert(verify.gate.configured === true, "gate must be configured for this smoke");
assert(verify.gate.gated === false, "gate must be locked for this smoke");

const init = await request("/api/game/action", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ action: "init" }),
});
assert(init.playerData.wallet === wallet, "init should still use the authenticated session wallet");

for (const blockedAction of ["claim_daily_flies", "claim_24h_reward", "enter_race_event", "claim_flies_skip"]) {
  const { res, data } = await action(blockedAction);
  if (res.status !== 403) {
    throw new Error(`${blockedAction} should be blocked, got ${res.status}: ${data.error || JSON.stringify(data)}`);
  }
}

const skipIntent = await rawRequest("/api/payments/intent", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ purpose: "claim_flies_skip" }),
});
if (skipIntent.res.ok) {
  throw new Error("payment intent should be blocked for a wallet below the holder gate");
}

console.log("Toad Jump gate-locked smoke checks passed.");
