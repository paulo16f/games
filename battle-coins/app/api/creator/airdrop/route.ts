import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { creatorKeyConfigured, hasCreatorKey } from "@/lib/creator-auth";
import { withPostgresAdvisoryLock } from "@/lib/db";
import { getRewardLedger, saveRewardLedger } from "@/lib/repository";
import { normalizeRewardLedger, payoutBlockedReason } from "@/lib/reward-engine";
import { transferRewardTokens } from "@/lib/treasury-transfer";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { key?: unknown; wallets?: unknown; amount?: unknown };

    if (!creatorKeyConfigured()) {
      return NextResponse.json({ error: "Creator dashboard key is not configured" }, { status: 503 });
    }
    if (!hasCreatorKey(body.key)) {
      return NextResponse.json({ error: "Invalid creator dashboard key" }, { status: 403 });
    }

    const wallets = Array.isArray(body.wallets) ? body.wallets.filter((w): w is string => typeof w === "string") : [];
    if (wallets.length === 0) {
      return NextResponse.json({ error: "wallets must be a non-empty array of strings" }, { status: 400 });
    }
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "amount must be a positive number" }, { status: 400 });
    }

    return await withPostgresAdvisoryLock("ledger:payouts", async () => {
      const rewardLedger = normalizeRewardLedger(await getRewardLedger());
      const results: Array<{ wallet: string; tx?: string; error?: string }> = [];
      for (const wallet of wallets) {
        const blocked = payoutBlockedReason(wallet, amount, rewardLedger);
        if (blocked) {
          results.push({ wallet, error: blocked });
          continue;
        }
        try {
          const tx = await transferRewardTokens(wallet, amount);
          rewardLedger.dailyTokenRewardsPaid = (rewardLedger.dailyTokenRewardsPaid ?? 0) + amount;
          rewardLedger.totalTokenRewardsPaid += amount;
          results.push({ wallet, tx });
        } catch (err) {
          rewardLedger.failedPayouts += 1;
          results.push({ wallet, error: err instanceof Error ? err.message : String(err) });
        }
      }
      await saveRewardLedger(rewardLedger);

      return NextResponse.json({ airdropped: true, amount, results });
    });
  } catch (error) {
    return apiError(error);
  }
}
