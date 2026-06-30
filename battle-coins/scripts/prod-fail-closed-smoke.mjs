import nacl from "tweetnacl";
import bs58 from "bs58";

const baseUrl = process.env.SMOKE_BASE_URL || "http://localhost:3001";
const wallet = bs58.encode(nacl.sign.keyPair().publicKey);

async function post(path, body) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

async function get(path) {
  const res = await fetch(`${baseUrl}${path}`);
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

const nonce = await post("/api/auth/nonce", { wallet });
if (nonce.res.status !== 503) {
  throw new Error(`/api/auth/nonce should fail closed without production Postgres, got ${nonce.res.status}`);
}

const health = await get("/api/health");
if (health.res.status !== 503 || health.data.ok !== false) {
  throw new Error(`/api/health should be red without production env, got ${health.res.status}`);
}

for (const path of [
  "/api/meta",
  "/api/season",
  "/api/leaderboard",
  "/api/races/current",
  "/api/races/leaderboard",
  "/api/seasons/history",
]) {
  const response = await get(path);
  if (response.res.status !== 503) {
    throw new Error(`${path} should fail closed with 503 without production Postgres, got ${response.res.status}`);
  }
  if (!response.data.error) {
    throw new Error(`${path} should return a JSON error when failing closed`);
  }
}

console.log("Toad Jump production fail-closed smoke checks passed.");
