import { PublicKey } from "@solana/web3.js";

export const PROGRAM_ID = new PublicKey(
  "6Rrp7e4J5pxNCQDddWivSbVzEoe2gv4VsrrTLCKKM2GL"
);

export interface WeaponEntry { name: string; emoji: string; atk: number; }
export interface ArmorEntry  { name: string; emoji: string; def: number; }

export const WEAPON_POOL: Record<number, WeaponEntry[]> = {
  2: [
    { name: "Iron Sword",  emoji: "🗡️", atk: 4 },
    { name: "Short Bow",   emoji: "🏹", atk: 5 },
  ],
  3: [{ name: "Steel Blade",      emoji: "⚔️", atk: 10 }],
  4: [{ name: "Enchanted Sword",  emoji: "✨", atk: 20 }],
  5: [{ name: "God's Blade",      emoji: "⚡", atk: 35 }],
};

export const ARMOR_POOL: Record<number, ArmorEntry[]> = {
  2: [
    { name: "Leather Vest", emoji: "🧥", def: 3 },
    { name: "Wood Shield",  emoji: "🛡️", def: 4 },
  ],
  3: [{ name: "Chain Mail",    emoji: "⛓️", def: 8  }],
  4: [{ name: "Dragon Scale",  emoji: "🐉", def: 16 }],
  5: [{ name: "Divine Armor",  emoji: "👑", def: 28 }],
};

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

export const ENEMIES = [
  { name: "Goblin", emoji: "👺", baseHp: 40 },
  { name: "Skeleton", emoji: "💀", baseHp: 50 },
  { name: "Orc", emoji: "👹", baseHp: 70 },
  { name: "Dragon", emoji: "🐉", baseHp: 100 },
  { name: "Slime", emoji: "🟩", baseHp: 20 },
  { name: "Vampire", emoji: "🧛", baseHp: 60 },
  { name: "Witch", emoji: "🧙", baseHp: 55 },
  { name: "Ghost", emoji: "👻", baseHp: 35 },
  { name: "Demon", emoji: "😈", baseHp: 90 },
  { name: "Zombie", emoji: "🧟", baseHp: 45 },
];
