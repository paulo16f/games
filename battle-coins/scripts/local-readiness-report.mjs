import { spawnSync } from "child_process";

function runNpm(args) {
  if (process.platform === "win32") {
    return spawnSync("cmd.exe", ["/d", "/s", "/c", "npm.cmd", ...args], {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
    });
  }

  return spawnSync("npm", args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
}

const steps = [
  {
    key: "env",
    label: "Production env preflight",
    args: ["run", "preflight:production"],
    requiredForCode: false,
  },
  {
    key: "build",
    label: "Production build",
    args: ["run", "build"],
    requiredForCode: true,
  },
  {
    key: "audit",
    label: "Dependency audit",
    args: ["audit"],
    requiredForCode: true,
  },
  {
    key: "copy",
    label: "Public copy risk smoke",
    args: ["run", "smoke:copy"],
    requiredForCode: true,
  },
  {
    key: "local-smoke",
    label: "Local API smoke suite",
    args: ["run", "smoke:local"],
    requiredForCode: true,
  },
  {
    key: "fail-closed",
    label: "Production fail-closed smoke",
    args: ["run", "smoke:prod-fail-closed:server"],
    requiredForCode: true,
  },
];

const results = [];

console.log("Toad Jump local launch-readiness report");
console.log("This command does not prove deployed mainnet readiness; it proves the local build/code gates.\n");

for (const step of steps) {
  console.log(`\n=== ${step.label} ===`);
  const startedAt = Date.now();
  const result = runNpm(step.args);
  const durationSeconds = Math.round((Date.now() - startedAt) / 1000);
  const status = result.status ?? 1;
  results.push({ ...step, status, durationSeconds });

  if (status !== 0 && step.requiredForCode) {
    console.log(`\nStopping after required gate failed: ${step.label}`);
    break;
  }
}

console.log("\n=== Summary ===");
for (const result of results) {
  const marker = result.status === 0 ? "PASS" : "FAIL";
  console.log(`[${marker}] ${result.label} (${result.durationSeconds}s)`);
}

const envResult = results.find((result) => result.key === "env");
const codeResults = results.filter((result) => result.requiredForCode);
const missingCodeSteps = steps.filter((step) => step.requiredForCode && !results.some((result) => result.key === step.key));
const codeFailed = codeResults.some((result) => result.status !== 0) || missingCodeSteps.length > 0;
const envFailed = !envResult || envResult.status !== 0;

if (codeFailed) {
  console.log("\nLocal code gates are not ready for deploy.");
  process.exit(1);
}

if (envFailed) {
  console.log("\nLocal code gates passed, but production env preflight is not ready in this shell.");
  console.log("Set/fix the production variables in Vercel, then deploy and run health:deployed + smoke:deployed.");
  process.exit(2);
}

console.log("\nLocal deploy gates passed.");
console.log("Next gates: Vercel deploy, /api/health ok:true, smoke:deployed, and real wallet canary.");
