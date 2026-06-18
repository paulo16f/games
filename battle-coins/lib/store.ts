import type { EquipmentSlot } from "./constants";

export interface Equipment {
  id: string;
  name: string;
  emoji: string;
  slot: EquipmentSlot;
  atk: number;
  def: number;
  tierId: number;
}

export interface PlayerState {
  health: number;
  tokens: number;
  atk: number;
  def: number;
  totalKills: number;
  totalPulls: number;
  lastPullTier: number;
  // 6 equipment slots
  weapon: Equipment | null;
  helmet: Equipment | null;
  chest:  Equipment | null;
  gloves: Equipment | null;
  boots:  Equipment | null;
  ring:   Equipment | null;
  // inventory bag (max 20)
  inventory: Equipment[];
  // token earning tracking
  damageTakenThisFight: number;
  lastActiveDate: string;
  killStreak: number;
}

export const DEFAULT_STATE = (): PlayerState => ({
  health: 100,
  tokens: 0,
  atk: 8,
  def: 0,
  totalKills: 0,
  totalPulls: 0,
  lastPullTier: 0,
  weapon: null,
  helmet: null,
  chest: null,
  gloves: null,
  boots: null,
  ring: null,
  inventory: [],
  damageTakenThisFight: 0,
  lastActiveDate: "",
  killStreak: 0,
});

declare global {
  // eslint-disable-next-line no-var
  var __bcStore: Map<string, PlayerState> | undefined;
}

if (!global.__bcStore) {
  global.__bcStore = new Map<string, PlayerState>();
}

export const store: Map<string, PlayerState> = global.__bcStore;

export function getOrCreate(wallet: string): PlayerState {
  if (!store.has(wallet)) store.set(wallet, DEFAULT_STATE());
  return store.get(wallet)!;
}
