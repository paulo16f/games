import { spawn } from "child_process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const port = 3001;

function spawnNpm(args, options) {
  if (process.platform === "win32") {
    return spawn("cmd.exe", ["/d", "/s", "/c", npm, ...args], options);
  }
  return spawn(npm, args, options);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(url, timeoutMs = 30_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.status < 500 || res.status === 503) return;
    } catch {}
    await delay(500);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function run(args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawnNpm(args, {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
      stdio: "inherit",
      shell: false,
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${npm} ${args.join(" ")} exited with ${code}`));
    });
    child.on("error", reject);
  });
}

async function stop(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === "win32") {
    await new Promise((resolve) => {
      const killer = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      killer.on("exit", resolve);
      killer.on("error", resolve);
    });
  } else {
    child.kill("SIGTERM");
  }
}

const failClosedEnv = {
  POSTGRES_URL: "",
  POSTGRES_PRISMA_URL: "",
  POSTGRES_URL_NON_POOLING: "",
  SESSION_SECRET: "",
  RPC_URL: "",
  NEXT_PUBLIC_RPC_URL: "",
  TOAD_JUMP_TOKEN_MINT: "",
  NEXT_PUBLIC_TOAD_JUMP_TOKEN_MINT: "",
};

const child = spawnNpm(["run", "start", "--", "-p", String(port)], {
  cwd: process.cwd(),
  env: { ...process.env, ...failClosedEnv },
  stdio: "inherit",
  shell: false,
});

try {
  await waitFor(`http://localhost:${port}/api/health`);
  await run(["run", "smoke:prod-fail-closed"], { ...failClosedEnv, SMOKE_BASE_URL: `http://localhost:${port}` });
} finally {
  await stop(child);
}

console.log("Toad Jump production fail-closed server smoke passed.");
