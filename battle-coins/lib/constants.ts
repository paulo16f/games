import { PublicKey } from "@solana/web3.js";

export const PROGRAM_ID = new PublicKey(
  "6Rrp7e4J5pxNCQDddWivSbVzEoe2gv4VsrrTLCKKM2GL"
);

// ─── Equipment slot types ────────────────────────────────────────────────────

export const EQUIP_SLOTS = ["weapon", "helmet", "chest", "gloves", "boots", "ring"] as const;
export type EquipmentSlot = (typeof EQUIP_SLOTS)[number];

export const SLOT_META: Record<EquipmentSlot, { label: string; placeholder: string }> = {
  weapon: { label: "Weapon", placeholder: "🗡️" },
  helmet: { label: "Helmet", placeholder: "🪖" },
  chest:  { label: "Chest",  placeholder: "🧥" },
  gloves: { label: "Gloves", placeholder: "🥊" },
  boots:  { label: "Boots",  placeholder: "👢" },
  ring:   { label: "Ring",   placeholder: "💍" },
};

// ─── Item pool types ─────────────────────────────────────────────────────────

export interface WeaponEntry { name: string; emoji: string; atk: number; }
export interface ChestEntry  { name: string; emoji: string; def: number; }
export interface HelmetEntry { name: string; emoji: string; def: number; }
export interface GlovesEntry { name: string; emoji: string; atk: number; }
export interface BootsEntry  { name: string; emoji: string; def: number; }
export interface RingEntry   { name: string; emoji: string; atk: number; def: number; }

// ─── Item pools (tier 2–5) ───────────────────────────────────────────────────

export const WEAPON_POOL: Record<number, WeaponEntry[]> = {
  2: [
    { name: "Iron Sword",  emoji: "🗡️", atk: 4 },
    { name: "Short Bow",   emoji: "🏹", atk: 5 },
  ],
  3: [{ name: "Steel Blade",      emoji: "⚔️", atk: 10 }],
  4: [{ name: "Enchanted Sword",  emoji: "✨", atk: 20 }],
  5: [{ name: "God's Blade",      emoji: "⚡", atk: 35 }],
};

export const CHEST_POOL: Record<number, ChestEntry[]> = {
  2: [
    { name: "Leather Vest", emoji: "🧥", def: 3 },
    { name: "Wood Shield",  emoji: "🛡️", def: 4 },
  ],
  3: [{ name: "Chain Mail",    emoji: "⛓️", def: 8  }],
  4: [{ name: "Dragon Scale",  emoji: "🐉", def: 16 }],
  5: [{ name: "Divine Armor",  emoji: "🌟", def: 28 }],
};

export const HELMET_POOL: Record<number, HelmetEntry[]> = {
  2: [{ name: "Leather Cap",    emoji: "🪖", def: 2  }],
  3: [{ name: "Iron Helm",      emoji: "⛑️", def: 6  }],
  4: [{ name: "Dragon Helm",    emoji: "🐲", def: 12 }],
  5: [{ name: "Crown of Gods",  emoji: "👑", def: 22 }],
};

export const GLOVES_POOL: Record<number, GlovesEntry[]> = {
  2: [{ name: "Leather Gloves",    emoji: "🥊", atk: 3  }],
  3: [{ name: "Battle Gauntlets",  emoji: "🤜", atk: 8  }],
  4: [{ name: "Enchanted Gloves",  emoji: "🪄", atk: 15 }],
  5: [{ name: "God's Grip",        emoji: "💫", atk: 25 }],
};

export const BOOTS_POOL: Record<number, BootsEntry[]> = {
  2: [{ name: "Leather Boots",   emoji: "👢", def: 2  }],
  3: [{ name: "Iron Boots",      emoji: "🥾", def: 5  }],
  4: [{ name: "Swift Boots",     emoji: "💨", def: 10 }],
  5: [{ name: "Hermes Sandals",  emoji: "⚡", def: 18 }],
};

export const RING_POOL: Record<number, RingEntry[]> = {
  2: [{ name: "Silver Ring",  emoji: "💍", atk: 2,  def: 1  }],
  3: [{ name: "Gold Ring",    emoji: "🔮", atk: 5,  def: 3  }],
  4: [{ name: "Arcane Ring",  emoji: "🌀", atk: 10, def: 6  }],
  5: [{ name: "Omniring",     emoji: "🌈", atk: 18, def: 12 }],
};

// ─── Sell values by tier ─────────────────────────────────────────────────────

export const SELL_VALUES: Record<number, number> = { 1: 0, 2: 1, 3: 3, 4: 8, 5: 30 };

// ─── Gacha tiers ─────────────────────────────────────────────────────────────

export const GACHA_TIERS = [
  {
    id: 1,
    name: "Common",
    probability: 60.0,
    rollMax: 600,
    rewardTokens: 0,
    color: "#6b7280",
    glow: "rgba(107,114,128,0.4)",
    bgClass: "from-gray-800 to-gray-700",
    borderClass: "border-gray-500",
    textClass: "text-gray-300",
    emoji: "⚪",
  },
  {
    id: 2,
    name: "Rare",
    probability: 25.0,
    rollMax: 850,
    rewardTokens: 1,
    color: "#3b82f6",
    glow: "rgba(59,130,246,0.6)",
    bgClass: "from-blue-900 to-blue-800",
    borderClass: "border-blue-400",
    textClass: "text-blue-300",
    emoji: "🔵",
  },
  {
    id: 3,
    name: "Super Rare",
    probability: 10.0,
    rollMax: 950,
    rewardTokens: 3,
    color: "#a855f7",
    glow: "rgba(168,85,247,0.7)",
    bgClass: "from-purple-900 to-purple-800",
    borderClass: "border-purple-400",
    textClass: "text-purple-300",
    emoji: "💜",
  },
  {
    id: 4,
    name: "Legendary",
    probability: 4.9,
    rollMax: 999,
    rewardTokens: 10,
    color: "#f59e0b",
    glow: "rgba(245,158,11,0.8)",
    bgClass: "from-yellow-900 to-amber-800",
    borderClass: "border-yellow-400",
    textClass: "text-yellow-300",
    emoji: "⭐",
  },
  {
    id: 5,
    name: "ULTRA",
    probability: 0.1,
    rollMax: 1000,
    rewardTokens: 100,
    color: "#ec4899",
    glow: "rgba(236,72,153,1.0)",
    bgClass: "from-pink-900 via-purple-900 to-indigo-900",
    borderClass: "border-pink-400",
    textClass: "text-pink-300",
    emoji: "🌈",
  },
] as const;

export type GachaTier = (typeof GACHA_TIERS)[number];

// ─── Pump.fun ────────────────────────────────────────────────────────────────

export const PUMP_TOKEN_MINT = "9GCoenzG61wmFuWA2E2TdaHqq1LsdkPLHYE5drPxpump";
export const PUMP_FUN_URL = "https://pump.fun/coin/9GCoenzG61wmFuWA2E2TdaHqq1LsdkPLHYE5drPxpump";
export const PUMP_GATE_AMOUNT = 1;

// ─── Enemies ─────────────────────────────────────────────────────────────────

export const ENEMIES = [
  { name: "Goblin",   emoji: "👺", baseHp: 40  },
  { name: "Skeleton", emoji: "💀", baseHp: 50  },
  { name: "Orc",      emoji: "👹", baseHp: 70  },
  { name: "Dragon",   emoji: "🐉", baseHp: 100 },
  { name: "Slime",    emoji: "🟩", baseHp: 20  },
  { name: "Vampire",  emoji: "🧛", baseHp: 60  },
  { name: "Witch",    emoji: "🧙", baseHp: 55  },
  { name: "Ghost",    emoji: "👻", baseHp: 35  },
  { name: "Demon",    emoji: "😈", baseHp: 90  },
  { name: "Zombie",   emoji: "🧟", baseHp: 45  },
];
