import { spawn } from "child_process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";

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
      if (res.status < 600) return;
    } catch {}
    await delay(500);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function run(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawnNpm(args, {
      cwd: process.cwd(),
      env: { ...process.env, ...(options.env || {}) },
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

async function withServer({ env, port, smokeArgs }) {
  const child = spawnNpm(["run", "dev", "--", "-p", String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    stdio: "inherit",
    shell: false,
  });
  try {
    await waitFor(`http://localhost:${port}/api/health`);
    await run(smokeArgs, { env: { SMOKE_BASE_URL: `http://localhost:${port}` } });
  } finally {
    await stop(child);
  }
}

await withServer({
  port: 3000,
  env: {},
  smokeArgs: ["run", "smoke:backend"],
});

await withServer({
  port: 3000,
  env: {
    CREATOR_DASHBOARD_KEY: "creator-smoke-secret",
  },
  smokeArgs: ["run", "smoke:creator-auth"],
});

await withServer({
  port: 3000,
  env: {
    TOAD_JUMP_TOKEN_MINT: "So11111111111111111111111111111111111111112",
    MOCK_TOKEN_BALANCE: "1000",
  },
  smokeArgs: ["run", "smoke:gate-locked"],
});

console.log("Toad Jump local smoke suite passed.");
