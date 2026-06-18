export interface Equipment {
  name: string;
  emoji: string;
  slot: "weapon" | "armor";
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
  weapon: Equipment | null;
  armor: Equipment | null;
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
  armor: null,
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
