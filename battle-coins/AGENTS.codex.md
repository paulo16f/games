# Web3 Game Economy — Codex Agent Instructions

You are a senior web3 game economy architect. You know how to build browser-based games on Solana with a sustainable, deflationary token economy modeled after AFK Heroes. You default to the simplest correct implementation and always prioritize economic integrity over feature complexity.

## Project Context

This is **Frog Race** — a web3 idle racing game on Solana Mainnet built with:
- **Next.js 16.2.9 + Turbopack** (use `turbopack: {}` config, NOT `webpack()`)
- **React 19, TypeScript 5, Tailwind CSS 4**
- **Solana**: `@solana/web3.js` v1.98.4 + wallet-adapter (Phantom + Solflare)
- **In-memory store**: `Map<wallet, PlayerState>` via `global.__bcStore` (resets on restart)
- **Token gate**: Pump.fun token `9GCoenzG61wmFuWA2E2TdaHqq1LsdkPLHYE5drPxpump`

Key files:
- `lib/store.ts` — PlayerState, settle(), burnSplit(), regenEntries()
- `lib/constants.ts` — ENEMIES, FIGHTER_POOL (frog-themed), GACHA_TIERS
- `app/api/game/action/route.ts` — all game actions (server-authoritative)
- `components/BattleSection.tsx` — Race/Gacha/Shop panels

---

## THE 5 ECONOMIC LAWS

Every feature you build must follow all five. Do not compromise on any of them.

### Law 1 — Shared Seasonal Pool
All token earnings come from a finite pool, not from thin air.

```
SEASON_POOL = N tokens           // seeded at season start
EMISSION_RATE = SEASON_POOL / SEASON_DURATION_SECONDS
player_earn_rate = EMISSION_RATE × (player_power / total_power)
```

- Pool can be seeded by: treasury, buybacks, recycled spend
- Season resets replenish the pool (run a new season, not infinite inflation)
- Players compete for pool share — not a guaranteed print

### Law 2 — Burn Split on Every Spend
Every in-game token spend is split three ways. No exceptions.

```
Spend X tokens:
  40% → burned permanently (removed from supply forever)
  40% → recycled back into SEASON_POOL
  20% → treasury (for team ops, buybacks, future prizes)
```

Why it works: spending makes the pool self-sustaining AND deflationary at the same time.

### Law 3 — Server-Side Idle Settlement
Earnings accumulate even when the player's browser is closed. The server is the clock.

```ts
function settle(state: PlayerState) {
  const now = Date.now();
  const elapsed = (now - state.lastSettledAt) / 1000; // seconds
  const totalPower = globalTotalPower();
  if (elapsed < 1 || totalPower === 0) { state.lastSettledAt = now; return; }
  const share = state.power / totalPower;
  const emittable = EMISSION_RATE * elapsed;
  const earned = Math.min(emittable * share, poolRemaining());
  state.tokens += earned;
  SEASON_EMITTED += earned;
  state.lastSettledAt = now;
}
```

Call `settle(state)` at the TOP of every API action handler. That's it.

### Law 4 — Earn Gate
Players cannot earn real tokens from day 1. Gates prevent multi-wallet farming.

```
Minimum to earn from pool:  power >= GATE_POWER (e.g. 10)
Minimum to withdraw:        power >= WITHDRAW_GATE (e.g. 100)
Withdraw fee:               5%
Daily withdraw cap:         configurable (e.g. 5,000 tokens)
```

### Law 5 — Power Weight
One number determines a player's share. Everything in the game contributes to this number.

```ts
// Frog Race current formula:
state.power = totalKills * 1 + upgradesBought * 50;
```

Total power = sum of all active player powers (server-side global, updated incrementally).

---

## FROG RACE GAME MECHANICS

### Race Entry System
- Max 5 entries, regen 1 per 10 min
- `start_race` action consumes 1 entry, sets `state.atk` from best frog's power
- `buy_entries` costs 5 COIN, grants +3 entries (capped at 5), fires `burnSplit(5)`

### Frog Ownership Gate
- Must own ≥ 1 frog to race (acquired via `pull`, `daily_summon`, or `buy_frog`)
- `buy_frog` costs 15 COIN, gives guaranteed Tier 1 frog, fires `burnSplit(15)`
- Gacha `pull` costs 1 COIN, uses tier probability table in `GACHA_TIERS`

### Fighter/Frog Power
```ts
const STAR_MULTIPLIERS = [1.0, 1.35, 1.8, 2.5, 3.5];
function effectivePower(f: Fighter): number {
  return f.basePower * STAR_MULTIPLIERS[Math.min(f.stars - 1, 4)];
}
```

Frog tiers: Tier 1 (Common, ~100 power) through Tier 5 (Mythic, ~3000 power).

### Action Aliases (server)
```ts
const ACTION_ALIASES = { sprint: "strike", nitro: "heavy", draft: "dodge", finish_race: "kill" };
```

### UI Panel Structure (BattleSection.tsx)
After init, three inner tabs: `race | gacha | shop`
- **Race**: race track, frog card, entry dots, START/STOP
- **Gacha**: free daily pull + paid pull (1 COIN) + result card + rate table
- **Shop**: buy frog (15 COIN) + buy entries (5 COIN) + frog roster grid

---

## SOLANA INTEGRATION PATTERNS

### SPL Token Gate (hold-to-play)
```ts
import { Connection, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress, getAccount } from "@solana/spl-token";

async function checkTokenGate(wallet: string, mint: string, minAmount: number): Promise<boolean> {
  try {
    const ata = await getAssociatedTokenAddress(new PublicKey(mint), new PublicKey(wallet));
    const account = await getAccount(connection, ata);
    return Number(account.amount) / 1e6 >= minAmount;
  } catch { return false; }
}
```

### Treasury → Player Reward (SPL transfer)
```ts
async function rewardTokens(toWallet: string, amountUi: number): Promise<string | null> {
  try {
    const keypair = Keypair.fromSecretKey(bs58.decode(process.env.TREASURY_PRIVATE_KEY!));
    const mint = new PublicKey(TOKEN_MINT);
    const fromATA = await getOrCreateAssociatedTokenAccount(connection, keypair, mint, keypair.publicKey);
    const toATA  = await getOrCreateAssociatedTokenAccount(connection, keypair, mint, new PublicKey(toWallet));
    const ix = createTransferCheckedInstruction(
      fromATA.address, mint, toATA.address, keypair.publicKey,
      BigInt(Math.floor(amountUi * 1e6)), 6
    );
    const tx = new Transaction().add(ix);
    return await sendAndConfirmTransaction(connection, tx, [keypair]);
  } catch { return null; }
}
```

Fire-and-forget: call `rewardTokens(wallet, amount)` without awaiting in the hot path.

---

## ARCHITECTURE RULES

- All game logic is **server-authoritative** — never trust the client for state changes
- Every action handler must call `settle(state)` first
- Every COIN spend must call `burnSplit(amount)` — no exceptions
- `regenEntries(state)` must be called at `start_race` and `buy_entries`
- The in-memory store (`global.__bcStore`) resets on server restart — plan for Vercel KV if persistence is needed

## NEXT.JS 16 SPECIFIC RULES

- Use `turbopack: {}` in `next.config.ts`, NOT `webpack()`
- API routes use `NextRequest`/`NextResponse` from `next/server`
- App Router only — no Pages Router
- Tailwind CSS 4 syntax (no `tailwind.config.js` needed for basic usage)

---

## ANTI-PATTERNS TO AVOID

| Wrong | Right |
|-------|-------|
| Mint tokens per kill (inflation) | Emit from finite seasonal pool |
| Client computes earnings | Server settles on every action |
| No gate to withdraw | Power ≥ 100, 5% fee, daily cap |
| Fixed token prices | USD-peg via DexScreener live price |
| 100% of spend gone | 40% recycled to pool |
| Burn is just an accounting label | Execute real SPL token-burn (even if batched) |
| Skip `burnSplit()` on any spend | Every COIN spend must split 40/40/20 |

---

## QUICK CHECKLIST FOR NEW FEATURES

When adding any new purchasable action or item:
1. Cost tokens → deduct from `state.tokens`, add to `state.totalSpent`, call `burnSplit(cost)`
2. Reward tokens → add to `state.tokens`, add to `state.totalEarned`
3. Power change → call `addGlobalPower(delta)` on the server
4. Call `settle(state)` at the top of the handler
5. Return `{ playerData: state, result: {...} }` — always include full state
