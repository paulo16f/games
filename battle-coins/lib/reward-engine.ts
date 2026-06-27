import { DAILY_FLIES } from "./constants";
import { toadJumpConfig } from "./config";
import { withPostgresAdvisoryLock } from "./db";
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

export { rankMultiplier };


function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function normalizeRewardLedger(ledger: TokenRewardLedger): TokenRewardLedger {
  const today = todayKey();
  if (ledger.dailyClaimDay !== today) {
    return {
      ...ledger,
      dailyPoolRemaining: toadJumpConfig.dailyTokenRewardPool,
      dailyClaimCount: 0,
      dailyTokenRewardsPaid: 0,
      dailyClaimDay: today,
    };
  }
  ledger.dailyTokenRewardsPaid ??= 0;
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

export function payoutBlockedReason(wallet: string, amount: number, rewardLedger: TokenRewardLedger): string | null {
  if (!toadJumpConfig.rewardPayoutsEnabled) return "Token payouts disabled; accounting only";
  if (toadJumpConfig.payoutCanaryWallets.length > 0 && !toadJumpConfig.payoutCanaryWallets.includes(wallet)) {
    return "Wallet is not in payout canary allowlist";
  }
  if (toadJumpConfig.maxPayoutPerClaim > 0 && amount > toadJumpConfig.maxPayoutPerClaim) {
    return "Claim exceeds MAX_PAYOUT_PER_CLAIM";
  }
  if (
    toadJumpConfig.maxTotalDailyPayout > 0 &&
    (rewardLedger.dailyTokenRewardsPaid ?? 0) + amount > toadJumpConfig.maxTotalDailyPayout
  ) {
    return "Daily payout cap reached";
  }
  return null;
}

async function payClaim(
  claim: TokenRewardClaim,
  rewardLedger: TokenRewardLedger,
  projectLedger: ProjectRewardsLedger
): Promise<TokenRewardClaim> {
  try {
    const blockedReason = payoutBlockedReason(claim.wallet, claim.amount, rewardLedger);
    if (blockedReason) {
      claim.status = "paid";
      claim.txSignature = null;
      claim.netAmount = 0;
      claim.burnedAmount = 0;
      claim.error = blockedReason;
      return saveRewardClaim(claim);
    }

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
    rewardLedger.dailyTokenRewardsPaid = (rewardLedger.dailyTokenRewardsPaid ?? 0) + claim.amount;
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
  let ledger = normalizeRewardLedger(await getRewardLedger());
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
  if (state.lastRewardClaimAt && now - state.lastRewardClaimAt < toadJumpConfig.rewardClaimCooldownMs) {
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
  state.nextRewardClaimAt = now + toadJumpConfig.rewardClaimCooldownMs;
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
    ledger: normalizeRewardLedger(await getRewardLedger()),
  };
}

export async function getRewardClaimById(id: string): Promise<TokenRewardClaim | null> {
  return getRewardClaim(id);
}

export function computePlayerReward(
  player: PlayerState,
  allPlayers: PlayerState[],
  projectLedger: ProjectRewardsLedger
): number {
  if (player.dailyJumpScore <= 0 || projectLedger.dailyActivePool <= 0) return 0;
  const sorted = allPlayers
    .filter((p) => p.initialized && p.dailyJumpScore > 0)
    .sort((a, b) => b.dailyJumpScore - a.dailyJumpScore);
  const rankIdx = sorted.findIndex((p) => p.wallet === player.wallet);
  if (rankIdx === -1) return 0;
  const rank = rankIdx + 1;
  const weightedTotal = sorted.reduce(
    (sum, p, idx) => sum + p.dailyJumpScore * rankMultiplier(idx + 1),
    0
  );
  if (weightedTotal <= 0) return 0;
  const share = (player.dailyJumpScore * rankMultiplier(rank)) / weightedTotal;
  return Math.min(
    toadJumpConfig.dailyTokenRewardAmount,
    Math.floor(projectLedger.dailyActivePool * share * 100) / 100
  );
}

export async function autoDistributeRewards(): Promise<{ paid: number; skipped: number; failed: number }> {
  return withPostgresAdvisoryLock("ledger:payouts", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const allPlayers = await listPlayers();
    const projectLedger = await getLedger();
    const rewardLedger = normalizeRewardLedger(await getRewardLedger());

    let paid = 0;
    let skipped = 0;
    let failed = 0;

    for (const player of allPlayers) {
      if (!player.initialized || player.dailyJumpScore <= 0) { skipped++; continue; }
      if (player.lastAutoPaidDate === today) { skipped++; continue; }
      if (projectLedger.dailyActivePool <= 0) { skipped++; continue; }

      const amount = computePlayerReward(player, allPlayers, projectLedger);
      const now = Date.now();
      const id = `auto:${player.wallet}:${today}`;

      const claim: TokenRewardClaim = {
        id,
        wallet: player.wallet,
        claimPeriodId: `auto:${today}`,
        status: "pending",
        amount,
        netAmount: 0,
        burnedAmount: 0,
        fliesGranted: DAILY_FLIES,
        holderBonus: 0,
        txSignature: null,
        error: null,
        createdAt: now,
        updatedAt: now,
      };

      try {
        await saveRewardClaim(claim);
        const paid_claim = await payClaim(claim, rewardLedger, projectLedger);
        player.flies += DAILY_FLIES;
        player.lastAutoPaidDate = today;
        player.lastDailyClaimDate = today;
        player.latestRewardClaimId = id;
        await savePlayer(player);
        if (paid_claim.status === "paid") paid++;
        else { failed++; }
      } catch {
        failed++;
      }
    }

    await saveRewardLedger(rewardLedger);
    await saveLedger(projectLedger);
    return { paid, skipped, failed };
  });
}

export async function payRacePrize(
  wallet: string,
  amount: number,
  projectLedger: ProjectRewardsLedger
): Promise<string | null> {
  if (amount < toadJumpConfig.minTokenClaimAmount) return null;
  return withPostgresAdvisoryLock("ledger:payouts", async () => {
    const rewardLedger = normalizeRewardLedger(await getRewardLedger());
    const blockedReason = payoutBlockedReason(wallet, amount, rewardLedger);
    if (blockedReason) return null;
    try {
      const result = await burnAndTransfer(
        wallet,
        amount,
        effectiveBurnRateBps(),
        toadJumpConfig.tokenDecimals
      );
      projectLedger.totalTokensBurned += result.burnedAmount;
      projectLedger.dailyTokensBurned += result.burnedAmount;
      rewardLedger.dailyTokenRewardsPaid = (rewardLedger.dailyTokenRewardsPaid ?? 0) + amount;
      rewardLedger.totalTokenRewardsPaid += amount;
      await saveRewardLedger(rewardLedger);
      await saveLedger(projectLedger);
      return result.txSignature;
    } catch {
      return null;
    }
  });
}
