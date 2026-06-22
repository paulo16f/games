import { ACTION_COSTS, EGG_ODDS, TOAD_TEMPLATES } from "./constants";
import { makeToad, PlayerState, Toad } from "./store";

export interface EggResult {
  toad: Toad;
  isNew: boolean;
  duplicate: boolean;
  bonusFlies: number;
}

export function openEgg(state: PlayerState): EggResult {
  if (state.flies < ACTION_COSTS.openEgg) {
    throw new Error(`Need ${ACTION_COSTS.openEgg} flies`);
  }

  state.flies -= ACTION_COSTS.openEgg;
  state.gachaPulls += 1;

  const roll = Math.random() * 100;
  let cursor = 0;
  const selected = EGG_ODDS.find((entry) => {
    cursor += entry.chance;
    return roll < cursor;
  }) ?? EGG_ODDS[0];

  const existing = state.toads.find((toad) => toad.kind === selected.kind);
  if (existing) {
    existing.xp += 10;
    const bonusFlies = selected.kind === "shadow" ? 2 : 1;
    state.flies += bonusFlies;
    return { toad: existing, isNew: false, duplicate: true, bonusFlies };
  }

  const toad = makeToad(selected.kind);
  state.toads.push(toad);
  if (!state.selectedToadId) state.selectedToadId = toad.id;
  return { toad, isNew: true, duplicate: false, bonusFlies: 0 };
}

export const eggRateTable = EGG_ODDS.map((entry) => ({
  ...entry,
  name: TOAD_TEMPLATES[entry.kind].name,
  rarity: TOAD_TEMPLATES[entry.kind].rarity,
}));
