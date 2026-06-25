import { NextRequest, NextResponse } from "next/server";
import { toadJumpConfig } from "@/lib/config";
import { transferRewardTokens } from "@/lib/treasury-transfer";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json() as { key?: unknown; wallets?: unknown; amount?: unknown };

  if (!toadJumpConfig.creatorDashboardKey) {
    return NextResponse.json({ error: "Creator dashboard key is not configured" }, { status: 503 });
  }
  if (body.key !== toadJumpConfig.creatorDashboardKey) {
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

  const results: Array<{ wallet: string; tx?: string; error?: string }> = [];
  for (const wallet of wallets) {
    try {
      const tx = await transferRewardTokens(wallet, amount);
      results.push({ wallet, tx });
    } catch (err) {
      results.push({ wallet, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return NextResponse.json({ airdropped: true, amount, results });
}
