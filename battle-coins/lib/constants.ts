import { toadJumpConfig } from "./config";

export const TOAD_JUMP_TOKEN_MINT = toadJumpConfig.tokenMint;
export const TOAD_JUMP_TOKEN_SYMBOL = toadJumpConfig.tokenSymbol;
export const TOAD_JUMP_GATE_AMOUNT = toadJumpConfig.gateAmount;
export const TOAD_JUMP_BUY_URL = toadJumpConfig.buyUrl;

export const STARTER_FLIES = 10;
export const DAILY_FLIES = 5;

export const ACTION_COSTS = {
  feedToad: 2,
  openEgg: 5,
  sprint: 2,
} as const;

export type ToadKind = "swamp" | "poison" | "crystal" | "shadow" | "emperor";

export interface ToadTemplate {
  kind: ToadKind;
  name: string;
  rarity: "Common" | "Uncommon" | "Rare" | "Epic" | "Legendary";
  speed: number;
  stamina: number;
  luck: number;
  consistency: number;
  locked?: boolean;
}

export const TOAD_TEMPLATES: Record<ToadKind, ToadTemplate> = {
  swamp: {
    kind: "swamp",
    name: "Swamp Toad",
    rarity: "Common",
    speed: 40,
    stamina: 40,
    luck: 35,
    consistency: 45,
  },
  poison: {
    kind: "poison",
    name: "Poison Dart",
    rarity: "Uncommon",
    speed: 58,
    stamina: 35,
    luck: 45,
    consistency: 50,
  },
  crystal: {
    kind: "crystal",
    name: "Crystal Frog",
    rarity: "Rare",
    speed: 40,
    stamina: 70,
    luck: 42,
    consistency: 65,
  },
  shadow: {
    kind: "shadow",
    name: "Shadow Toad",
    rarity: "Epic",
    speed: 50,
    stamina: 48,
    luck: 82,
    consistency: 55,
  },
  emperor: {
    kind: "emperor",
    name: "Golden Emperor",
    rarity: "Legendary",
    speed: 82,
    stamina: 80,
    luck: 88,
    consistency: 82,
  },
};

export const RARITY_CYCLE_MS: Record<string, number> = {
  Common:    45_000,
  Uncommon:  30_000,
  Rare:      18_000,
  Epic:      10_000,
  Legendary:  6_000,
};

export const EGG_ODDS: Array<{ kind: ToadKind; chance: number }> = [
  { kind: "swamp",   chance: 58 },
  { kind: "poison",  chance: 20 },
  { kind: "crystal", chance: 14 },
  { kind: "shadow",  chance: 6  },
  { kind: "emperor", chance: 2  },
];

export const TOAD_DAILY_ENERGY: Record<ToadKind, number> = {
  swamp:   5,
  poison:  7,
  crystal: 8,
  shadow:  6,
  emperor: 12,
};

export const WEEKLY_REWARD_TIERS = [
  { rankMax: 1, flies: 40, badge: "Weekly Champion", skin: "Crown Splash" },
  { rankMax: 3, flies: 25, badge: "Podium Racer", skin: "Silver Ripple" },
  { rankMax: 10, flies: 15, badge: "Top Racer", skin: "Blue Wake" },
] as const;

export const WEEKLY_ACTIVE_REWARD = {
  minScore: 25,
  flies: 8,
  badge: "Active Racer",
  skin: "Green Wake",
} as const;
