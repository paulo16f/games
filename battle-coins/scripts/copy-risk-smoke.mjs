import fs from "fs";

const targets = ["app/page.tsx"];
const forbidden = [
  /\bearn real tokens\b/i,
  /\bguaranteed?\b/i,
  /\binvest(ment|or|ing)?\b/i,
  /\bprofit(s|able)?\b/i,
  /\bmoon\b/i,
  /\bwin tokens\b/i,
  /\btoken prizes\b/i,
  /\bholders benefit\b/i,
  /\bchildren'?s product\b/i,
  /\bkids?\b/i,
  /\bminors?\b/i,
];

const failures = [];

for (const target of targets) {
  const text = fs.readFileSync(target, "utf8");
  const lines = text.split(/\r?\n/);
  for (const pattern of forbidden) {
    lines.forEach((line, index) => {
      if (pattern.test(line)) {
        failures.push(`${target}:${index + 1}: matches ${pattern}: ${line.trim()}`);
      }
    });
  }
}

if (failures.length) {
  console.error("Public copy risk smoke failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Public copy risk smoke passed.");
