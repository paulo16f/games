import { GACHA_TIERS, GachaTier } from "./constants";

export function rollGachaTier(): GachaTier {
  const roll = Math.floor(Math.random() * 1000);
  if (roll < 600) return GACHA_TIERS[0]; // Common
  if (roll < 850) return GACHA_TIERS[1]; // Rare
  if (roll < 950) return GACHA_TIERS[2]; // Super Rare
  if (roll < 999) return GACHA_TIERS[3]; // Legendary
  return GACHA_TIERS[4]; // Ultra
}
