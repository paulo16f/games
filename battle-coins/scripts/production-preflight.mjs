import fs from "fs";
import path from "path";
import bs58 from "bs58";

const envFiles = [".env", ".env.local", ".env.production", ".env.production.local"];
const loadedFiles = [];

function parseEnvFile(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  loadedFiles.push(path.basename(filePath));
  const text = fs.readFileSync(filePath, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const fileEnv = {};
for (const file of envFiles) {
  Object.assign(fileEnv, parseEnvFile(path.join(process.cwd(), file)));
}

const env = { ...fileEnv, ...process.env };
const errors = [];
const warnings = [];

function valueFor(names) {
  for (const name of names) {
    const value = env[name];
    if (typeof value === "string" && value.trim() !== "") {
      return { name, value: value.trim() };
    }
  }
  return { name: names[0], value: "" };
}

function fail(message) {
  errors.push(message);
}

function warn(message) {
  warnings.push(message);
}

function requireGroup(label, names, validate) {
  const found = valueFor(names);
  if (!found.value) {
    fail(`${label} is missing (${names.join(" or ")})`);
    return found;
  }
  if (found.name !== names[0]) {
    warn(`${label} uses alias ${found.name}; prefer ${names[0]} for new projects`);
  }
  if (validate) validate(found.value, found.name);
  return found;
}

function isUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function validatePublicKey(value, label) {
  try {
    const bytes = bs58.decode(value);
    if (bytes.length !== 32) throw new Error("wrong length");
  } catch {
    fail(`${label} must be a valid Solana public key`);
  }
}

function validatePositiveNumber(value, label) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    fail(`${label} must be a positive number`);
  }
}

function validateIntegerRange(value, label, min, max) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    fail(`${label} must be an integer from ${min} to ${max}`);
  }
}

function validateSecret(value, label, minLength = 32) {
  const lower = value.toLowerCase();
  if (value.length < minLength) {
    fail(`${label} should be at least ${minLength} characters`);
  }
  for (const unsafe of ["change-me", "changeme", "local-dev", "password", "secret"]) {
    if (lower.includes(unsafe)) fail(`${label} contains placeholder text`);
  }
}

function validateTreasuryPrivateKey(value) {
  const trimmed = value.trim();
  if (trimmed.length < 32) {
    fail("TREASURY_PRIVATE_KEY is too short");
    return;
  }

  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (!Array.isArray(parsed) || parsed.length !== 64 || parsed.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
        fail("TREASURY_PRIVATE_KEY JSON must be a 64-byte secret key array");
      }
    } catch {
      fail("TREASURY_PRIVATE_KEY JSON is invalid");
    }
    return;
  }

  try {
    const bytes = bs58.decode(trimmed);
    if (bytes.length === 32) {
      fail("TREASURY_PRIVATE_KEY looks like a public key; use the treasury secret key");
    } else if (bytes.length !== 64) {
      warn("TREASURY_PRIVATE_KEY is not a 64-byte base58 secret key; confirm the payout signer format before enabling payouts");
    }
  } catch {
    warn("TREASURY_PRIVATE_KEY is not base58 or JSON array; confirm the signer format before enabling payouts");
  }
}

console.log("Toad Jump production preflight");
console.log(`Loaded env files: ${loadedFiles.length ? loadedFiles.join(", ") : "none"}\n`);

requireGroup("POSTGRES_URL", ["POSTGRES_URL"], (value) => {
  if (!/^postgres(ql)?:\/\//i.test(value)) fail("POSTGRES_URL must be a postgres:// or postgresql:// URL");
});

const sessionSecret = requireGroup("SESSION_SECRET", ["SESSION_SECRET"], (value) => validateSecret(value, "SESSION_SECRET", 32));

const rpc = requireGroup("RPC_URL", ["RPC_URL", "NEXT_PUBLIC_RPC_URL"], (value, name) => {
  if (!isUrl(value)) fail(`${name} must be an http(s) URL`);
  if (/devnet|testnet/i.test(value)) fail(`${name} points at devnet/testnet; production must use mainnet RPC`);
});

requireGroup(
  "TOAD_JUMP_TOKEN_MINT",
  ["TOAD_JUMP_TOKEN_MINT", "NEXT_PUBLIC_TOAD_JUMP_TOKEN_MINT", "RUNNING_TOADS_TOKEN_MINT", "NEXT_PUBLIC_RUNNING_TOADS_TOKEN_MINT"],
  (value) => validatePublicKey(value, "TOAD_JUMP_TOKEN_MINT"),
);

requireGroup(
  "TOAD_JUMP_TOKEN_SYMBOL",
  ["TOAD_JUMP_TOKEN_SYMBOL", "NEXT_PUBLIC_TOAD_JUMP_TOKEN_SYMBOL", "RUNNING_TOADS_TOKEN_SYMBOL", "NEXT_PUBLIC_RUNNING_TOADS_TOKEN_SYMBOL"],
  (value) => {
    if (!/^[A-Za-z0-9]{2,12}$/.test(value)) fail("TOAD_JUMP_TOKEN_SYMBOL should be 2-12 alphanumeric characters");
  },
);

requireGroup(
  "TOAD_JUMP_TOKEN_DECIMALS",
  ["TOAD_JUMP_TOKEN_DECIMALS", "RUNNING_TOADS_TOKEN_DECIMALS"],
  (value) => validateIntegerRange(value, "TOAD_JUMP_TOKEN_DECIMALS", 0, 18),
);

requireGroup(
  "TOAD_JUMP_GATE_AMOUNT",
  ["TOAD_JUMP_GATE_AMOUNT", "NEXT_PUBLIC_TOAD_JUMP_GATE_AMOUNT", "RUNNING_TOADS_GATE_AMOUNT", "NEXT_PUBLIC_RUNNING_TOADS_GATE_AMOUNT"],
  (value) => validatePositiveNumber(value, "TOAD_JUMP_GATE_AMOUNT"),
);

requireGroup(
  "NEXT_PUBLIC_TOAD_JUMP_BUY_URL",
  ["NEXT_PUBLIC_TOAD_JUMP_BUY_URL", "TOAD_JUMP_BUY_URL", "NEXT_PUBLIC_RUNNING_TOADS_BUY_URL", "RUNNING_TOADS_BUY_URL"],
  (value) => {
    if (!isUrl(value) || value === "#") fail("NEXT_PUBLIC_TOAD_JUMP_BUY_URL must be a real http(s) buy URL");
  },
);

requireGroup("TREASURY_WALLET", ["TREASURY_WALLET"], (value) => validatePublicKey(value, "TREASURY_WALLET"));
requireGroup("TREASURY_PRIVATE_KEY", ["TREASURY_PRIVATE_KEY"], validateTreasuryPrivateKey);

const cronSecret = requireGroup("CRON_SECRET", ["CRON_SECRET"], (value) => validateSecret(value, "CRON_SECRET", 32));
const creatorKey = requireGroup("CREATOR_DASHBOARD_KEY", ["CREATOR_DASHBOARD_KEY"], (value) => validateSecret(value, "CREATOR_DASHBOARD_KEY", 32));

const payouts = valueFor(["REWARDS_PAYOUTS_ENABLED"]);
if (!payouts.value) {
  fail("REWARDS_PAYOUTS_ENABLED must be set to false for public launch");
} else if (payouts.value.toLowerCase() !== "false") {
  fail("REWARDS_PAYOUTS_ENABLED must stay false until an audited SPL payout transport is installed");
}

for (const [key, value] of Object.entries(env)) {
  if (/^NEXT_PUBLIC_.*(SECRET|PRIVATE|CRON|SESSION|TREASURY)/i.test(key) && value) {
    fail(`${key} looks like a public secret; remove it from client-exposed env`);
  }
}

const secretPairs = [
  ["SESSION_SECRET", sessionSecret.value],
  ["CRON_SECRET", cronSecret.value],
  ["CREATOR_DASHBOARD_KEY", creatorKey.value],
].filter(([, value]) => value);

for (let i = 0; i < secretPairs.length; i++) {
  for (let j = i + 1; j < secretPairs.length; j++) {
    if (secretPairs[i][1] === secretPairs[j][1]) {
      fail(`${secretPairs[i][0]} and ${secretPairs[j][0]} must be different values`);
    }
  }
}

if (rpc.value && /api\.mainnet-beta\.solana\.com/i.test(rpc.value)) {
  warn("Public mainnet RPC may be rate limited; use Helius, QuickNode, Triton, or another dedicated RPC for launch");
}

if (warnings.length) {
  console.log("Warnings:");
  for (const message of warnings) console.log(`- ${message}`);
  console.log("");
}

if (errors.length) {
  console.error("Production preflight failed:");
  for (const message of errors) console.error(`- ${message}`);
  process.exit(1);
}

console.log("Production preflight passed.");
console.log("Next gates: deploy, /api/health ok:true, smoke:deployed, and real wallet canary.");
