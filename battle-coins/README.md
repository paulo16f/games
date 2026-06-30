# Toad Jump

Production-focused Next.js/Solana game base for a Pump.fun token-gated launch.

## Launch Status

The app is designed to fail closed in production. Do not share a public launch link until:

- `/api/health` returns `ok: true` on the deployed domain.
- `npm.cmd run smoke:deployed` passes against the deployed domain.
- A real Phantom or Solflare mainnet canary proves the 1,000-token skip flow.
- `REWARDS_PAYOUTS_ENABLED=false` remains set unless a clean SPL payout signer has been added and audited.

## Required Production Environment

Copy the names from `.env.production.example` into Vercel Production. At minimum:

```bash
POSTGRES_URL
SESSION_SECRET
RPC_URL
TOAD_JUMP_TOKEN_MINT
TOAD_JUMP_TOKEN_SYMBOL
TOAD_JUMP_TOKEN_DECIMALS
TOAD_JUMP_GATE_AMOUNT
NEXT_PUBLIC_TOAD_JUMP_BUY_URL
TREASURY_WALLET
TREASURY_PRIVATE_KEY
CRON_SECRET
CREATOR_DASHBOARD_KEY
REWARDS_PAYOUTS_ENABLED=false
```

Generate a session secret locally:

```bash
npm.cmd run secret:session
```

Then add it to Vercel:

```bash
vercel env add SESSION_SECRET production
```

Use unique values for `SESSION_SECRET`, `CRON_SECRET`, and `CREATOR_DASHBOARD_KEY`. Never expose them through `NEXT_PUBLIC_*` variables.

## Local Verification

Run the full local readiness report before every production deploy:

```bash
npm.cmd run readiness:local
```

The report exits nonzero when code gates pass but the current shell does not have production env configured. That is expected if you keep real secrets only in Vercel; the summary will say whether the code gates passed.

The underlying gates are:

```bash
npm.cmd run preflight:production
npm.cmd run build
npm.cmd audit
npm.cmd run smoke:copy
npm.cmd run smoke:local
npm.cmd run smoke:prod-fail-closed:server
```

Expected audit result:

```bash
found 0 vulnerabilities
```

## Deploy And Smoke

Vercel Hobby only supports daily cron jobs, so `vercel.json` keeps only the daily creator sync. Race settlement also runs opportunistically from Home/Races traffic.

```bash
vercel --prod .
```

After deployment:

```bash
$env:DEPLOYED_BASE_URL="https://YOUR_DOMAIN"
npm.cmd run health:deployed
npm.cmd run smoke:deployed
```

Also open:

```bash
https://YOUR_DOMAIN/api/health
```

Production is not ready while health is red. Run `npm.cmd run health:deployed` for the exact failed checks and next fixes. Common missing checks are `SESSION_SECRET`, `POSTGRES_URL`, `rpcLive`, `mintAccount`, `mintTokenProgram`, or `treasuryTokenAccount`.

## Pump.fun Launch Notes

Use this app around an existing Pump.fun mint. Create the token and metadata outside this app, then wire the final mint and buy URL into Vercel.

See:

- `docs/PRODUCTION_LAUNCH_REVIEW.md`
- `docs/PUMPFUN_LAUNCH_CHECKLIST.md`

The app records creator SOL separately from token reward units. Token reward pools must be funded explicitly in token units.
