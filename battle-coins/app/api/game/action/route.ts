import { NextRequest, NextResponse } from "next/server";
import { rollGachaTier } from "@/lib/gacha";
import { store, getOrCreate, DEFAULT_STATE, Equipment } from "@/lib/store";
import { WEAPON_POOL, ARMOR_POOL } from "@/lib/constants";

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function rollItem(tierId: number): Equipment | null {
  if (tierId < 2) return null;
  const isWeapon = Math.random() < 0.5;
  if (isWeapon) {
    const pool = WEAPON_POOL[tierId];
    if (!pool?.length) return null;
    const base = pool[Math.floor(Math.random() * pool.length)];
    return { name: base.name, emoji: base.emoji, atk: base.atk, def: 0, slot: "weapon", tierId };
  } else {
    const pool = ARMOR_POOL[tierId];
    if (!pool?.length) return null;
    const base = pool[Math.floor(Math.random() * pool.length)];
    return { name: base.name, emoji: base.emoji, atk: 0, def: base.def, slot: "armor", tierId };
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      action: "init" | "strike" | "heavy" | "dodge" | "kill" | "heal" | "pull";
      wallet: string;
      isBoss?: boolean;
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
        result = { playerDamage, enemyDamage };
        break;
      }

      case "kill": {
        const tokensEarned = isBoss ? 3 : 1;
        state.tokens += tokensEarned;
        state.totalKills += 1;
        result = { tokensEarned };
        break;
      }

      case "heal": {
        if (state.tokens < 1) {
          return NextResponse.json({ error: "Not enough tokens" }, { status: 400 });
        }
        state.tokens -= 1;
        state.health = 100;
        result = { healed: true };
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
        if (item) {
          state[item.slot] = item;
          state.atk = 8 + (state.weapon?.atk ?? 0);
          state.def = 0 + (state.armor?.def ?? 0);
        }

        result = {
          tierId: tier.id,
          tierName: tier.name,
          rewardTokens: tier.rewardTokens,
          item: item ?? null,
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
