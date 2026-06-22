import { NextRequest, NextResponse } from "next/server";
import { settleAutoJump } from "@/lib/idle-engine";
import { getPlayer, savePlayer } from "@/lib/repository";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet")?.trim();
  if (!wallet) {
    return NextResponse.json({ error: "wallet required" }, { status: 400 });
  }

  const player = await getPlayer(wallet);
  if (player.initialized) {
    await settleAutoJump(player);
    await savePlayer(player);
  }
  return NextResponse.json(player);
}
