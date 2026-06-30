# Production Launch Review

Last reviewed: 2026-06-30

## Verdict

The project is ready for a Vercel preview and a small mainnet canary, but not for an uncapped public money launch.

The app now has server-side wallet auth, required production persistence, guarded reward payouts, Hobby-compatible race settlement, and a verified on-chain payment path for the 1,000-token free-flies timer skip. Real token reward payouts remain intentionally disabled unless a clean SPL payout transport is added and audited.

## Required Production Environment

Set these in Vercel Production before deploying:

- `POSTGRES_URL`
- `SESSION_SECRET`
- `RPC_URL` or `NEXT_PUBLIC_RPC_URL`
- `TOAD_JUMP_TOKEN_MINT`
- `TOAD_JUMP_TOKEN_SYMBOL`
- `TOAD_JUMP_TOKEN_DECIMALS`
- `TOAD_JUMP_GATE_AMOUNT`
- `NEXT_PUBLIC_TOAD_JUMP_BUY_URL`
- `TREASURY_WALLET`
- `TREASURY_PRIVATE_KEY`
- `CRON_SECRET`
- `CREATOR_DASHBOARD_KEY`
- `REWARDS_PAYOUTS_ENABLED=false`

Recommended canary-only payout settings if payouts are later enabled:

- `PAYOUT_CANARY_WALLETS`
- `MAX_PAYOUT_PER_CLAIM`
- `MAX_TOTAL_DAILY_PAYOUT`

Generate `SESSION_SECRET` with:

```bash
npm.cmd run secret:session
```

Then add it to Vercel Production:

```bash
vercel env add SESSION_SECRET production
```

## What Is Protected

- Wallet auth uses SIWS-style nonce signing and an `httpOnly` `toad_session` cookie.
- `/api/game/action` ignores client-submitted wallet values and uses the session wallet.
- Public `/api/meta` and `/api/season` return only public game totals; private creator accounting stays behind the creator dashboard key.
- Production storage fails closed if Postgres is missing.
- `/api/health` checks Postgres schema, live RPC, mint account existence, SPL token-program compatibility, and the treasury token account needed for the 1,000-token skip.
- State-changing wallet actions are protected with advisory locks when Postgres is configured.
- Race settlement is available through the protected cron route and also runs opportunistically when players open Home or Races.
- The 1,000-token skip creates a server-side payment intent, asks the wallet to sign/send a token transfer, verifies the confirmed transaction, then grants flies.
- Direct `claim_flies_skip` calls through `/api/game/action` are rejected.
- Duplicate payment confirmation is locked and rejected.
- Reward payouts default to accounting-only with no SPL transfer transport installed.
- Creator-fee SOL sync records SOL separately and does not credit token reward pools; token rewards must be funded explicitly in token units.

## Known Launch Limits

- Vercel Hobby only allows daily cron jobs. `vercel.json` schedules only the daily creator sync. Race settlement runs on player traffic unless the project upgrades to Pro and re-adds the 30-minute cron.
- The 1,000-token skip requires the treasury wallet to already have a token account for the configured mint; `/api/health` is red until that account exists.
- Real daily/race token reward payouts are not live while `REWARDS_PAYOUTS_ENABLED=false`.
- The current clean base does not include a treasury SPL payout signer; enabling payouts requires adding and auditing a clean transport.
- A real Phantom/Solflare mainnet smoke test is still mandatory because local CI cannot sign a real wallet transaction.
- Pump.fun token/trading features should be marketed to eligible adults only. Keep the game copy simple and readable, but do not position the project as a children's game.

## Verification Commands

Run before every production deploy:

```bash
npm.cmd run readiness:local
```

The report runs the local code gates and the production env preflight. A nonzero exit can still mean the local code gates passed but this shell is missing production env values; read the summary and fix those values in Vercel before deploying.

Individual gates:

```bash
npm.cmd run preflight:production
npm.cmd run build
npm.cmd audit
npm.cmd run smoke:copy
```

Run local API smokes with managed dev servers:

```bash
npm.cmd run smoke:local
```

Run the fail-closed production smoke after `npm.cmd run build`:

```bash
npm.cmd run smoke:prod-fail-closed:server
```

After deploy:

```bash
curl https://YOUR_DOMAIN/api/health
$env:DEPLOYED_BASE_URL="https://YOUR_DOMAIN"
npm.cmd run health:deployed
npm.cmd run smoke:deployed
```

The health endpoint must return `ok: true` before public launch. If it is red, run `npm.cmd run health:deployed` and fix the failed checks before running the full deployed smoke.

## Manual Mainnet Canary

Use `docs/PUMPFUN_LAUNCH_CHECKLIST.md` for the Pump.fun token handoff before this app canary.

1. Deploy with `REWARDS_PAYOUTS_ENABLED=false`.
2. Sign in with Phantom and Solflare.
3. Confirm guest mode requires How To Play before entry.
4. Claim free flies once.
5. Wait for cooldown, then run the 1,000-token skip with a canary wallet.
6. Confirm the payment transaction on Solana explorer.
7. Confirm the app grants exactly `+5` flies once.
8. Enter a race and verify it settles through Home/Races traffic.
9. Manually call `/api/cron/creator-rewards` with `Authorization: Bearer $CRON_SECRET`.
10. Run `npm.cmd run smoke:deployed` against the production URL.
11. Check Vercel logs for auth, DB, RPC, payment, and cron errors.

## External References Used

- Phantom Solana transaction docs: `https://docs.phantom.com/solana/sending-a-transaction`
- Next.js route handler docs in `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`
- Local web3 economy guidance in `.claude/agents/web3-game-economy.md`
