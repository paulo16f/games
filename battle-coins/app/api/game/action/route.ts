import { NextRequest, NextResponse } from "next/server";
import { rollGachaTier } from "@/lib/gacha";
import { store, getOrCreate, DEFAULT_STATE, Equipment, PlayerState } from "@/lib/store";
import {
  WEAPON_POOL, CHEST_POOL, HELMET_POOL, GLOVES_POOL, BOOTS_POOL, RING_POOL,
  SELL_VALUES, EQUIP_SLOTS, EquipmentSlot,
} from "@/lib/constants";

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function recalcStats(s: PlayerState): void {
  s.atk = 8
    + (s.weapon?.atk ?? 0)
    + (s.gloves?.atk ?? 0)
    + (s.ring?.atk   ?? 0);
  s.def =
    (s.helmet?.def ?? 0)
    + (s.chest?.def  ?? 0)
    + (s.boots?.def  ?? 0)
    + (s.ring?.def   ?? 0);
}

function rollItem(tierId: number): Equipment | null {
  if (tierId < 2) return null;
  const slot = EQUIP_SLOTS[Math.floor(Math.random() * EQUIP_SLOTS.length)] as EquipmentSlot;
  const poolMap = {
    weapon: WEAPON_POOL,
    chest:  CHEST_POOL,
    helmet: HELMET_POOL,
    gloves: GLOVES_POOL,
    boots:  BOOTS_POOL,
    ring:   RING_POOL,
  };
  const pool = poolMap[slot][tierId];
  if (!pool?.length) return null;
  const base = pool[Math.floor(Math.random() * pool.length)];
  return {
    id: crypto.randomUUID(),
    name: base.name,
    emoji: base.emoji,
    atk: "atk" in base ? (base as { atk: number }).atk : 0,
    def: "def" in base ? (base as { def: number }).def : 0,
    slot,
    tierId,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      action: "init" | "strike" | "heavy" | "dodge" | "kill" | "heal" | "pull" | "equip" | "sell";
      wallet: string;
      isBoss?: boolean;
      itemId?: string;
    };
    const { action, wallet, isBoss } = body;

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

        // Daily bonus — first combat action of the calendar day
        const today = new Date().toISOString().slice(0, 10);
        let dailyBonus = 0;
        if (state.lastActiveDate !== today) {
          state.lastActiveDate = today;
          state.tokens += 5;
          dailyBonus = 5;
        }

        const wave = Math.floor(state.totalKills / 5);
        const enemyBaseATK = 5 + wave * 3;

        let playerDamage: number;
        let enemyDamage: number;

        if (action === "strike") {
          playerDamage = state.atk + rand(1, 6);
          enemyDamage = Math.max(0, enemyBaseATK - state.def + rand(-3, 3));
        } else if (action === "heavy") {
          playerDamage = Math.floor(state.atk * 1.8) + rand(1, 10);
          enemyDamage = Math.max(0, Math.floor(enemyBaseATK * 1.4) - state.def + rand(-2, 2));
        } else {
          playerDamage = Math.floor(state.atk * 0.4) + rand(0, 3);
          enemyDamage = 0;
        }

        state.health = Math.max(0, state.health - enemyDamage);
        state.damageTakenThisFight += enemyDamage;
        result = { playerDamage, enemyDamage, dailyBonus };
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
        result = { tokensEarned, streakBonus, perfectBonus, killStreak: state.killStreak };
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

        const item = rollItem(tier.id);
        let autoSold = false;
        let autoSellTokens = 0;

        if (item) {
          if (state.inventory.length >= 20) {
            autoSellTokens = SELL_VALUES[item.tierId] ?? 0;
            state.tokens += autoSellTokens;
            autoSold = true;
          } else {
            state.inventory.push(item);
          }
        }

        result = {
          tierId: tier.id,
          tierName: tier.name,
          rewardTokens: tier.rewardTokens,
          item: item ?? null,
          autoSold,
          autoSellTokens,
        };
        break;
      }

      case "equip": {
        const { itemId } = body;
        if (!itemId) {
          return NextResponse.json({ error: "Missing itemId" }, { status: 400 });
        }
        const idx = state.inventory.findIndex((i) => i.id === itemId);
        if (idx === -1) {
          return NextResponse.json({ error: "Item not in inventory" }, { status: 400 });
        }
        const newItem = state.inventory[idx];
        const displaced = state[newItem.slot];
        state.inventory.splice(idx, 1);
        if (displaced) state.inventory.push(displaced);
        state[newItem.slot] = newItem;
        recalcStats(state);
        result = { equipped: newItem, displaced: displaced ?? null };
        break;
      }

      case "sell": {
        const { itemId } = body;
        if (!itemId) {
          return NextResponse.json({ error: "Missing itemId" }, { status: 400 });
        }
        const idx = state.inventory.findIndex((i) => i.id === itemId);
        if (idx === -1) {
          return NextResponse.json({ error: "Item not in inventory" }, { status: 400 });
        }
        const soldItem = state.inventory[idx];
        const tokensGained = SELL_VALUES[soldItem.tierId] ?? 0;
        state.inventory.splice(idx, 1);
        state.tokens += tokensGained;
        result = { sold: soldItem, tokensGained };
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
