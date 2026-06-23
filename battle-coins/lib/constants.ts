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
    speed: 55,
    stamina: 55,
    luck: 45,
    consistency: 60,
  },
  poison: {
    kind: "poison",
    name: "Poison Dart",
    rarity: "Uncommon",
    speed: 82,
    stamina: 38,
    luck: 45,
    consistency: 52,
  },
  crystal: {
    kind: "crystal",
    name: "Crystal Frog",
    rarity: "Rare",
    speed: 40,
    stamina: 84,
    luck: 42,
    consistency: 68,
  },
  shadow: {
    kind: "shadow",
    name: "Shadow Toad",
    rarity: "Epic",
    speed: 55,
    stamina: 48,
    luck: 86,
    consistency: 58,
  },
  emperor: {
    kind: "emperor",
    name: "Golden Emperor",
    rarity: "Legendary",
    speed: 92,
    stamina: 88,
    luck: 90,
    consistency: 86,
  },
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
