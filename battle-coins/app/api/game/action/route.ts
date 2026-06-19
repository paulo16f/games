import { NextRequest, NextResponse } from "next/server";
import { rollGachaTier } from "@/lib/gacha";
import { store, getOrCreate, DEFAULT_STATE, Fighter, PlayerState } from "@/lib/store";
import { rewardTokens } from "@/lib/solana-rewards";
import {
  ENEMIES, EnemyElement, FIGHTER_POOL, STAR_MULTIPLIERS, NPC_OPPONENTS,
} from "@/lib/constants";

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function effectivePower(f: { basePower: number; stars: number }): number {
  return f.basePower * STAR_MULTIPLIERS[Math.min(f.stars - 1, 4)];
}

const WEAKNESS_MAP: Record<EnemyElement, "strike" | "heavy" | "dodge"> = {
  fire: "heavy", ice: "strike", dark: "dodge", light: "heavy", physical: "strike",
};

function rollFighter(tierId: number, state: PlayerState): {
  fighter: Fighter; starsUp: boolean; isNew: boolean;
} {
  const pool = FIGHTER_POOL[tierId] ?? FIGHTER_POOL[1];
  const base = pool[Math.floor(Math.random() * pool.length)];
  const existing = state.fighters.find(f => f.name === base.name);
  let starsUp = false;

  if (existing) {
    if (existing.stars < 5) { existing.stars += 1; starsUp = true; }
    else state.tokens += tierId * 2;
    return { fighter: existing, starsUp, isNew: false };
  } else {
    const newFighter: Fighter = {
      id: crypto.randomUUID(),
      name: base.name, emoji: base.emoji, element: base.element,
      tierId, stars: 1, basePower: base.basePower,
    };
    state.fighters.push(newFighter);
    return { fighter: newFighter, starsUp: false, isNew: true };
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      action: "init" | "strike" | "heavy" | "dodge" | "kill" | "heal" | "pull" | "daily_summon" | "arena_fight";
      wallet: string;
      isBoss?: boolean;
      enemyName?: string;
      opponentWallet?: string;
    };
    const { action, wallet, isBoss, enemyName, opponentWallet } = body;

    if (!action || !wallet) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const state = getOrCreate(wallet);
    let result: Record<string, unknown> = {};

    switch (action) {
      case "init": {
        store.set(wallet, DEFAULT_STATE());
        result = { initialized: true };
        return NextResponse.json({ playerData: store.get(wallet)!, result });
      }

      case "strike":
      case "heavy":
      case "dodge": {
        if (state.health === 0) {
          return NextResponse.json({ error: "You are dead — heal first" }, { status: 400 });
        }

        // Stun: skip turn
        if (state.playerStatus === "stun") {
          state.playerStatusDuration -= 1;
          if (state.playerStatusDuration <= 0) { state.playerStatus = "none"; state.playerStatusDuration = 0; }
          return NextResponse.json({
            playerData: state,
            result: { stunned: true, playerDamage: 0, enemyDamage: 0, dailyBonus: 0,
              isCrit: false, comboCount: state.comboCount, comboMult: 1,
              isWeakness: false, isCounter: false, statusApplied: null,
              enemyTelegraphing: state.enemyTelegraphing, burnDamage: 0 },
          });
        }

        // Burn tick
        let burnDamage = 0;
        if (state.playerStatus === "burn") {
          burnDamage = 5;
          state.health = Math.max(0, state.health - burnDamage);
          state.playerStatusDuration -= 1;
          if (state.playerStatusDuration <= 0) { state.playerStatus = "none"; state.playerStatusDuration = 0; }
        }

        // Daily login bonus
        const today = new Date().toISOString().slice(0, 10);
        let dailyBonus = 0;
        if (state.lastActiveDate !== today) {
          state.lastActiveDate = today;
          state.tokens += 5;
          dailyBonus = 5;
        }

        // Enemy lookup
        const enemyData = ENEMIES.find(e => e.name === enemyName);
        const enemyElement  = (enemyData?.element  ?? "physical") as EnemyElement;
        const enemyStatus   = enemyData?.statusApplied ?? null;
        const specialChance = enemyData?.specialChance ?? 0.15;

        // Wave scaling
        const wave = Math.floor(state.totalKills / 5);
        const enemyBaseATK = 5 + wave * 3;

        // Base damage
        let playerDamage: number;
        let enemyDamage: number;
        if (action === "strike") {
          playerDamage = state.atk + rand(1, 6);
          enemyDamage  = Math.max(0, enemyBaseATK - state.def + rand(-3, 3));
        } else if (action === "heavy") {
          playerDamage = Math.floor(state.atk * 1.8) + rand(1, 10);
          enemyDamage  = Math.max(0, Math.floor(enemyBaseATK * 1.4) - state.def + rand(-2, 2));
        } else {
          playerDamage = Math.floor(state.atk * 0.4) + rand(0, 3);
          enemyDamage  = 0;
        }

        // Crit (15%)
        const isCrit = Math.random() < 0.15;
        if (isCrit) playerDamage = Math.floor(playerDamage * 2);

        // Weakness (+30%)
        const isWeakness = WEAKNESS_MAP[enemyElement] === action;
        if (isWeakness) playerDamage = Math.floor(playerDamage * 1.3);

        // Combo
        if (state.comboMoveType !== "" && action === state.comboMoveType) {
          state.comboCount = Math.min(state.comboCount + 1, 5);
        } else {
          state.comboCount = 1;
          state.comboMoveType = action;
        }
        const comboMult = 1 + (state.comboCount - 1) * 0.2;
        playerDamage = Math.floor(playerDamage * comboMult);

        // Telegraph resolution
        let isCounter = false;
        if (state.enemyTelegraphing) {
          if (action === "dodge") {
            isCounter = true;
            enemyDamage = 0;
            playerDamage += Math.floor(state.atk * 0.8);
          } else {
            enemyDamage = Math.floor(enemyDamage * 2);
          }
          state.enemyTelegraphing = false;
        }

        // Apply damage
        state.health = Math.max(0, state.health - enemyDamage);
        state.damageTakenThisFight += enemyDamage;
        if (enemyDamage > 0) state.comboCount = 1;

        // Status from enemy
        let statusApplied: string | null = null;
        if (enemyDamage > 0 && enemyStatus && state.playerStatus === "none" && Math.random() < 0.3) {
          state.playerStatus = enemyStatus;
          state.playerStatusDuration = 3;
          statusApplied = enemyStatus;
        }

        // Next telegraph
        state.enemyTelegraphing = Math.random() < specialChance;

        result = {
          playerDamage, enemyDamage, dailyBonus,
          isCrit, comboCount: state.comboCount, comboMult,
          isWeakness, isCounter, statusApplied,
          enemyTelegraphing: state.enemyTelegraphing,
          burnDamage, stunned: false,
        };
        break;
      }

      case "kill": {
        state.killStreak += 1;
        const streakBonus =
          state.killStreak >= 20 ? 3 :
          state.killStreak >= 10 ? 2 :
          state.killStreak >= 5  ? 1 : 0;
        const perfectBonus = state.damageTakenThisFight === 0 ? 1 : 0;
        const tokensEarned = (isBoss ? 3 : 1) + streakBonus + perfectBonus;
        state.tokens += tokensEarned;
        state.totalKills += 1;
        state.damageTakenThisFight = 0;
        state.enemyTelegraphing = false;

        // Real on-chain rewards (fire-and-forget)
        const now = Date.now();
        const COOLDOWN = 5 * 60 * 1000;
        let realReward = 0;
        if (isBoss && now - state.lastBossRewardAt > COOLDOWN) {
          state.lastBossRewardAt = now;
          realReward = 0.5;
          rewardTokens(wallet, 0.5);
        } else if (state.killStreak >= 20 && now - state.lastStreakRewardAt > COOLDOWN) {
          state.lastStreakRewardAt = now;
          realReward = 2;
          rewardTokens(wallet, 2);
        }

        result = { tokensEarned, streakBonus, perfectBonus, killStreak: state.killStreak, realReward };
        break;
      }

      case "heal": {
        if (state.tokens < 1) {
          return NextResponse.json({ error: "Not enough tokens" }, { status: 400 });
        }
        const wasDead = state.health === 0;
        if (wasDead) {
          state.killStreak = 0;
          state.damageTakenThisFight = 0;
          state.comboCount = 1;
          state.comboMoveType = "";
          state.playerStatus = "none";
          state.playerStatusDuration = 0;
        }
        state.tokens -= 1;
        state.health = 100;
        result = { healed: true, streakReset: wasDead };
        break;
      }

      case "pull": {
        if (state.tokens < 1) {
          return NextResponse.json({ error: "Not enough tokens" }, { status: 400 });
        }
        state.tokens -= 1;
        const tier = rollGachaTier();
        state.tokens += tier.rewardTokens;
        state.totalPulls += 1;
        state.lastPullTier = tier.id;

        const { fighter, starsUp, isNew } = rollFighter(tier.id, state);
        result = {
          tierId: tier.id, tierName: tier.name, rewardTokens: tier.rewardTokens,
          fighter, starsUp, isNew,
        };
        break;
      }

      case "daily_summon": {
        const today = new Date().toISOString().slice(0, 10);
        if (state.lastDailySummonDate === today) {
          return NextResponse.json({ error: "Already summoned today" }, { status: 400 });
        }
        state.lastDailySummonDate = today;
        state.totalPulls += 1;

        const tierId = Math.random() < 0.25 ? 2 : 1;
        const { fighter, starsUp, isNew } = rollFighter(tierId, state);
        result = {
          tierId, tierName: tierId === 2 ? "Rare" : "Common",
          rewardTokens: 0, fighter, starsUp, isNew,
        };
        break;
      }

      case "arena_fight": {
        if (!opponentWallet) {
          return NextResponse.json({ error: "Missing opponentWallet" }, { status: 400 });
        }
        if (!state.fighters.length) {
          return NextResponse.json({ error: "No fighters — pull from gacha first" }, { status: 400 });
        }

        const playerFighter = state.fighters.reduce((best, f) =>
          effectivePower(f) > effectivePower(best) ? f : best
        );
        const pp = effectivePower(playerFighter);

        // Resolve opponent power
        let op = 100;
        if (opponentWallet.startsWith("NPC:")) {
          const npc = NPC_OPPONENTS.find(n => n.wallet === opponentWallet);
          if (npc) op = npc.fighter.basePower * STAR_MULTIPLIERS[Math.min(npc.fighter.stars - 1, 4)];
        } else {
          const oppState = store.get(opponentWallet);
          if (oppState?.fighters.length) {
            const oppBest = oppState.fighters.reduce((best, f) =>
              effectivePower(f) > effectivePower(best) ? f : best
            );
            op = effectivePower(oppBest);
          }
        }

        // 70% stats, 30% randomness — win chance capped [0.18, 0.82]
        const avg = (pp + op) / 2;
        const delta = avg > 0 ? (pp - op) / avg : 0;
        const winChance = Math.min(0.82, Math.max(0.18, 0.5 + 0.32 * Math.tanh(delta)));
        const won = Math.random() < winChance;

        const tokensEarned = won ? 3 : 1;
        state.tokens += tokensEarned;
        state.arenaRating = Math.max(0, state.arenaRating + (won ? 15 : -10));

        result = {
          won,
          winChance: Math.round(winChance * 100),
          playerPower: Math.round(pp),
          opponentPower: Math.round(op),
          ratingChange: won ? 15 : -10,
          newRating: state.arenaRating,
          tokensEarned,
          playerFighter,
        };
        break;
      }

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    return NextResponse.json({ playerData: state, result });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
