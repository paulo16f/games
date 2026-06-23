import { DAILY_FLIES } from "./constants";
import { toadJumpConfig } from "./config";
import {
  getLedger,
  getRewardClaim,
  getRewardLedger,
  latestRewardClaim,
  listPlayers,
  savePlayer,
  saveLedger,
  saveRewardClaim,
  saveRewardLedger,
} from "./repository";
import { PlayerState, ProjectRewardsLedger, TokenRewardClaim, TokenRewardLedger } from "./store";
import { TokenGateResult } from "./token-gate";
import { burnAndTransfer } from "./treasury-transfer";

const CLAIM_COOLDOWN_MS = 24 * 60 * 60 * 1000;

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function normalizeLedger(ledger: TokenRewardLedger): TokenRewardLedger {
  const today = todayKey();
  if (ledger.dailyClaimDay !== today) {
    return {
      ...ledger,
      dailyPoolRemaining: toadJumpConfig.dailyTokenRewardPool,
      dailyClaimCount: 0,
      dailyClaimDay: today,
    };
  }
  return ledger;
}

function holderBonusFlies(gate: TokenGateResult): number {
  return gate.balance >= gate.gateAmount * 4 ? 5 : gate.balance >= gate.gateAmount * 2 ? 2 : 0;
}

function claimId(wallet: string, now: number): string {
  return `${wallet}:${now}`;
}

function effectiveBurnRateBps(): number {
  return toadJumpConfig.burnEnabled ? toadJumpConfig.burnRateBps : 0;
}

async function payClaim(
  claim: TokenRewardClaim,
  rewardLedger: TokenRewardLedger,
  projectLedger: ProjectRewardsLedger
): Promise<TokenRewardClaim> {
  try {
    if (claim.amount < toadJumpConfig.minTokenClaimAmount) {
      const burnBps = effectiveBurnRateBps();
      const notionalBurn = Math.floor(claim.amount * burnBps / 10_000 * 100) / 100;
      claim.status = "paid";
      claim.txSignature = null;
      claim.netAmount = 0;
      claim.burnedAmount = notionalBurn;
      claim.error = "Token amount below minimum transfer; flies granted only";
      if (notionalBurn > 0) {
        projectLedger.totalTokensBurned += notionalBurn;
        projectLedger.dailyTokensBurned += notionalBurn;
        projectLedger.dailyActivePool = Math.max(0, projectLedger.dailyActivePool - claim.amount);
        projectLedger.holderRewardsPool = Math.max(0, projectLedger.holderRewardsPool - claim.amount);
        await saveLedger(projectLedger);
      }
      return saveRewardClaim(claim);
    }
    if (projectLedger.dailyActivePool < claim.amount) {
      throw new Error("Daily token reward pool is empty");
    }

    if (!toadJumpConfig.treasuryPrivateKey || !toadJumpConfig.tokenMint) {
      claim.status = "paid";
      claim.txSignature = null;
      claim.netAmount = 0;
      claim.burnedAmount = 0;
      claim.error = "Treasury not configured — flies granted only";
      return saveRewardClaim(claim);
    }

    const result = await burnAndTransfer(
      claim.wallet,
      claim.amount,
      effectiveBurnRateBps(),
      toadJumpConfig.tokenDecimals,
    );

    claim.status = "paid";
    claim.txSignature = result.txSignature;
    claim.netAmount = result.netAmount;
    claim.burnedAmount = result.burnedAmount;
    claim.error = null;

    rewardLedger.dailyPoolRemaining = Math.max(0, rewardLedger.dailyPoolRemaining - claim.amount);
    rewardLedger.totalTokenRewardsPaid += claim.amount;
    projectLedger.dailyActivePool = Math.max(0, projectLedger.dailyActivePool - claim.amount);
    projectLedger.holderRewardsPool = Math.max(0, projectLedger.holderRewardsPool - claim.amount);
    projectLedger.totalJumpRewardsPaid += claim.amount;
    projectLedger.totalTokensBurned += result.burnedAmount;
    projectLedger.dailyTokensBurned += result.burnedAmount;

    await saveRewardLedger(rewardLedger);
    await saveLedger(projectLedger);
  } catch (error) {
    claim.status = "failed";
    claim.error = error instanceof Error ? error.message : "Token transfer failed";
    claim.netAmount = 0;
    claim.burnedAmount = 0;
    rewardLedger.failedPayouts += 1;
    await saveRewardLedger(rewardLedger);
  }
  return saveRewardClaim(claim);
}

async function claimRank(wallet: string): Promise<number> {
  const ranked = (await listPlayers())
    .filter((player) => player.initialized && player.dailyJumpScore > 0)
    .sort((a, b) => b.dailyJumpScore - a.dailyJumpScore);
  const index = ranked.findIndex((player) => player.wallet === wallet);
  return index >= 0 ? index + 1 : ranked.length + 1;
}

function rankMultiplier(rank: number): number {
  if (rank === 1) return 2;
  if (rank <= 3) return 1.5;
  if (rank <= 10) return 1.2;
  return 1;
}

async function activeRewardAmount(state: PlayerState, projectLedger: ProjectRewardsLedger): Promise<number> {
  if (state.dailyJumpScore <= 0 || projectLedger.dailyActivePool <= 0) return 0;
  const players = (await listPlayers()).filter((player) => player.initialized && player.dailyJumpScore > 0);
  const weightedTotal = players.reduce((sum, player) => {
    const rankIndex = players
      .slice()
      .sort((a, b) => b.dailyJumpScore - a.dailyJumpScore)
      .findIndex((entry) => entry.wallet === player.wallet);
    return sum + player.dailyJumpScore * rankMultiplier(rankIndex + 1);
  }, 0);
  if (weightedTotal <= 0) return 0;
  const rank = await claimRank(state.wallet);
  const share = (state.dailyJumpScore * rankMultiplier(rank)) / weightedTotal;
  return Math.min(
    toadJumpConfig.dailyTokenRewardAmount,
    Math.floor(projectLedger.dailyActivePool * share * 100) / 100
  );
}

export async function claim24hReward(
  state: PlayerState,
  gate: TokenGateResult
): Promise<{ claim: TokenRewardClaim; nextRewardClaimAt: number; retry: boolean }> {
  const now = Date.now();
  let ledger = normalizeLedger(await getRewardLedger());
  const projectLedger = await getLedger();
  await saveRewardLedger(ledger);

  const latest = await latestRewardClaim(state);
  const canRetry =
    latest &&
    latest.status === "failed" &&
    state.nextRewardClaimAt > now;

  if (canRetry) {
    const retryClaim = await payClaim(latest, ledger, projectLedger);
    return { claim: retryClaim, nextRewardClaimAt: state.nextRewardClaimAt, retry: true };
  }

  if (state.dailyJumpScore <= 0) {
    throw new Error("No active jumps settled for this 24h period");
  }
  if (state.lastRewardClaimAt && now - state.lastRewardClaimAt < CLAIM_COOLDOWN_MS) {
    throw new Error("24h reward is not ready yet");
  }
  if (ledger.dailyClaimCount >= toadJumpConfig.maxDailyTokenClaims) {
    throw new Error("Daily token reward claim limit reached");
  }
  if (projectLedger.dailyActivePool <= 0) {
    throw new Error("Daily token reward pool is empty");
  }

  const holderBonus = holderBonusFlies(gate);
  const fliesGranted = DAILY_FLIES + holderBonus;
  const amount = await activeRewardAmount(state, projectLedger);
  const id = claimId(gate.wallet, now);
  const claim: TokenRewardClaim = {
    id,
    wallet: gate.wallet,
    claimPeriodId: `24h:${gate.wallet}:${now}`,
    status: "pending",
    amount,
    netAmount: 0,
    burnedAmount: 0,
    fliesGranted,
    holderBonus,
    txSignature: null,
    error: null,
    createdAt: now,
    updatedAt: now,
  };

  ledger.dailyClaimCount += 1;
  await saveRewardLedger(ledger);
  await saveRewardClaim(claim);

  state.flies += fliesGranted;
  state.lastDailyClaimDate = todayKey();
  state.lastRewardClaimAt = now;
  state.nextRewardClaimAt = now + CLAIM_COOLDOWN_MS;
  state.latestRewardClaimId = id;
  await savePlayer(state);

  const paidClaim = await payClaim(claim, ledger, projectLedger);
  return { claim: paidClaim, nextRewardClaimAt: state.nextRewardClaimAt, retry: false };
}

export async function rewardStatus(state: PlayerState) {
  const claim = await latestRewardClaim(state);
  return {
    lastRewardClaimAt: state.lastRewardClaimAt,
    nextRewardClaimAt: state.nextRewardClaimAt,
    latestClaim: claim,
    ledger: normalizeLedger(await getRewardLedger()),
  };
}

export async function getRewardClaimById(id: string): Promise<TokenRewardClaim | null> {
  return getRewardClaim(id);
}

export async function payRacePrize(
  wallet: string,
  amount: number,
  projectLedger: ProjectRewardsLedger
): Promise<string | null> {
  if (amount < toadJumpConfig.minTokenClaimAmount) return null;
  try {
    const result = await burnAndTransfer(
      wallet,
      amount,
      effectiveBurnRateBps(),
      toadJumpConfig.tokenDecimals
    );
    projectLedger.totalTokensBurned += result.burnedAmount;
    projectLedger.dailyTokensBurned += result.burnedAmount;
    await saveLedger(projectLedger);
    return result.txSignature;
  } catch {
    return null;
  }
}
