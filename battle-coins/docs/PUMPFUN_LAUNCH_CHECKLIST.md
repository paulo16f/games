# Pump.fun Launch Checklist

Last reviewed: 2026-06-30

## Launch Position

Toad Jump should launch as a game utility around an existing Pump.fun mint, not as an automated token launcher inside the app.

The app expects the token mint to already exist, then uses that mint for:

- holder gate checks
- the Pump.fun buy link
- the 1,000-token free-flies skip payment verification
- reward accounting

Do not enable uncapped token payouts at launch. Keep `REWARDS_PAYOUTS_ENABLED=false` until a clean, audited SPL payout signer is installed and a mainnet canary succeeds.

## Before Creating The Token

Prepare these public launch assets:

- Token name
- Token symbol
- Token image
- Short plain-English description
- Website URL
- X/Twitter URL
- Telegram or community URL, if used

PumpPortal's current token-creation docs state that Pump.fun no longer supports direct metadata uploads to the old API and that programmatic creation needs metadata uploaded to IPFS first. Use a stable IPFS provider and save the final metadata URI before launch.

Source: `https://pumpportal.fun/creation/`

## After The Token Exists

Capture the final mint address immediately and set these production values:

```bash
vercel env add TOAD_JUMP_TOKEN_MINT production
vercel env add TOAD_JUMP_TOKEN_SYMBOL production
vercel env add TOAD_JUMP_TOKEN_DECIMALS production
vercel env add TOAD_JUMP_GATE_AMOUNT production
vercel env add NEXT_PUBLIC_TOAD_JUMP_BUY_URL production
```

Use the Pump.fun coin page as `NEXT_PUBLIC_TOAD_JUMP_BUY_URL`.

Before public launch, create or fund the treasury token account for the mint. The app's 1,000-token skip sends tokens to the treasury token account, and `/api/health` will stay red until that account exists.

## Creator Fees

This codebase does not automatically claim Pump.fun creator fees. It records creator funding only after the creator dashboard key authorizes it.

PumpPortal documents creator-fee collection through `collectCreatorFee`, including local transactions that you sign and send yourself. If you automate creator-fee collection later, keep it behind `CREATOR_DASHBOARD_KEY` or a cron secret and record SOL fees separately from token reward units.

Source: `https://pumpportal.fun/creator-fee/`

## Production App Wiring

Set every value from `.env.production.example` in Vercel Production.

Required launch defaults:

```bash
REWARDS_PAYOUTS_ENABLED=false
MAX_PAYOUT_PER_CLAIM=0
MAX_TOTAL_DAILY_PAYOUT=0
```

Run before deploying:

```bash
npm.cmd run readiness:local
```

If it exits nonzero, read the summary. The code gates can pass while the current shell is missing production env values; configure those in Vercel before deploying.

Individual gates:

```bash
npm.cmd run preflight:production
npm.cmd run build
npm.cmd audit
npm.cmd run smoke:copy
npm.cmd run smoke:local
npm.cmd run smoke:prod-fail-closed:server
```

After deploy:

```bash
curl https://YOUR_DOMAIN/api/health
$env:DEPLOYED_BASE_URL="https://YOUR_DOMAIN"
npm.cmd run health:deployed
npm.cmd run smoke:deployed
```

The health endpoint must return `ok: true` before the public launch link is shared. If it is red, run `npm.cmd run health:deployed` for exact failed checks and next fixes. It verifies session config, Postgres, live RPC access, mint existence, SPL token-program compatibility, and the treasury token account.

## Mainnet Canary

1. Connect Phantom and Solflare.
2. Sign in with SIWS.
3. Confirm a non-holder cannot claim free flies, claim token rewards, or enter token-gated races.
4. Confirm a holder can claim free flies.
5. Run one 1,000-token skip with a small canary wallet.
6. Verify the transaction on Solana explorer.
7. Confirm exactly `+5` flies are granted once.
8. Confirm the same transaction signature cannot be reused.
9. Run `npm.cmd run smoke:deployed` against the production URL.
10. Check Vercel logs for DB, RPC, auth, and payment errors.

## Public Launch Rule

Pump.fun's public flow warns that prices can move quickly and asks users to certify they are over 18. Keep the game readable and simple, but do not market it as a children's product.
