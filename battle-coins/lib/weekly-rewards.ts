import { WEEKLY_ACTIVE_REWARD, WEEKLY_REWARD_TIERS } from "./constants";
import { listPlayers } from "./repository";
import { PlayerState, previousWeekId, WeeklyRewardClaim } from "./store";

export interface WeeklyRewardPreview {
  weekId: string;
  rank: number | null;
  score: number;
  flies: number;
  badge: string;
  skin: string;
  claimable: boolean;
  alreadyClaimed: boolean;
}

async function weeklyRank(state: PlayerState, weekId: string): Promise<number | null> {
  const snapshot = state.weeklyHistory[weekId];
  if (!snapshot || snapshot.score <= 0) return null;
  const ranked = (await listPlayers())
    .filter((player) => (player.weeklyHistory[weekId]?.score ?? 0) > 0)
    .sort((a, b) => {
      const aWeek = a.weeklyHistory[weekId] ?? { score: 0, wins: 0 };
      const bWeek = b.weeklyHistory[weekId] ?? { score: 0, wins: 0 };
      return bWeek.score - aWeek.score || bWeek.wins - aWeek.wins;
    });
  const index = ranked.findIndex((player) => player.wallet === state.wallet);
  return index >= 0 ? index + 1 : null;
}

export async function previewWeeklyReward(state: PlayerState, weekId = previousWeekId()): Promise<WeeklyRewardPreview> {
  const score = state.weeklyHistory[weekId]?.score ?? 0;
  const rank = await weeklyRank(state, weekId);
  const alreadyClaimed = state.lastWeeklyClaimId === weekId;

  const rankTier = rank ? WEEKLY_REWARD_TIERS.find((tier) => rank <= tier.rankMax) : undefined;
  const activeTier = score >= WEEKLY_ACTIVE_REWARD.minScore ? WEEKLY_ACTIVE_REWARD : undefined;
  const tier = rankTier ?? activeTier;

  return {
    weekId,
    rank,
    score,
    flies: tier?.flies ?? 0,
    badge: tier?.badge ?? "",
    skin: tier?.skin ?? "",
    claimable: Boolean(tier) && !alreadyClaimed,
    alreadyClaimed,
  };
}

export async function claimWeeklyReward(state: PlayerState): Promise<WeeklyRewardClaim> {
  const reward = await previewWeeklyReward(state);
  if (reward.alreadyClaimed) throw new Error("Weekly rewards already claimed");
  if (!reward.claimable) throw new Error("No weekly reward available yet");

  state.flies += reward.flies;
  state.lastWeeklyClaimId = reward.weekId;
  const claim: WeeklyRewardClaim = {
    weekId: reward.weekId,
    rank: reward.rank,
    score: reward.score,
    flies: reward.flies,
    badge: reward.badge,
    skin: reward.skin,
    claimedAt: Date.now(),
  };
  state.weeklyRewardClaims.push(claim);
  return claim;
}
