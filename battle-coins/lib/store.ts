export interface Fighter {
  id: string;
  name: string;
  emoji: string;
  element: string;
  tierId: number;
  stars: number;   // 1–5
  basePower: number;
}

export interface PlayerState {
  health: number;
  tokens: number;
  atk: number;
  def: number;
  totalKills: number;
  totalPulls: number;
  lastPullTier: number;
  // fighter collection
  fighters: Fighter[];
  // arena
  arenaRating: number;
  // token earning tracking
  damageTakenThisFight: number;
  lastActiveDate: string;
  killStreak: number;
  lastDailySummonDate: string;
  // real token reward cooldowns (epoch ms)
  lastBossRewardAt: number;
  lastStreakRewardAt: number;
  // combat system
  comboCount: number;
  comboMoveType: string;
  playerStatus: "none" | "burn" | "stun";
  playerStatusDuration: number;
  enemyTelegraphing: boolean;
}

export const DEFAULT_STATE = (): PlayerState => ({
  health: 100,
  tokens: 0,
  atk: 8,
  def: 0,
  totalKills: 0,
  totalPulls: 0,
  lastPullTier: 0,
  fighters: [],
  arenaRating: 100,
  damageTakenThisFight: 0,
  lastActiveDate: "",
  killStreak: 0,
  lastDailySummonDate: "",
  lastBossRewardAt: 0,
  lastStreakRewardAt: 0,
  comboCount: 1,
  comboMoveType: "",
  playerStatus: "none",
  playerStatusDuration: 0,
  enemyTelegraphing: false,
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
