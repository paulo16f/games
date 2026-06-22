import { NextRequest, NextResponse } from "next/server";
import { runningToadsConfig } from "@/lib/config";
import { getLedger, saveLedger } from "@/lib/repository";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json() as { amount?: unknown; key?: unknown; note?: unknown };
  if (!runningToadsConfig.creatorDashboardKey) {
    return NextResponse.json({ error: "Creator dashboard key is not configured" }, { status: 503 });
  }
  if (body.key !== runningToadsConfig.creatorDashboardKey) {
    return NextResponse.json({ error: "Invalid creator dashboard key" }, { status: 403 });
  }
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "amount must be a positive number" }, { status: 400 });
  }

  const ledger = await getLedger();
  ledger.creatorRewardsRecorded += amount;
  ledger.dailyActivePool += amount;
  ledger.holderRewardsPool += amount;
  ledger.totalReturnedToProject += amount;
  await saveLedger(ledger);

  return NextResponse.json({
    recorded: true,
    amount,
    note: typeof body.note === "string" ? body.note : "",
    ledger,
  });
}
