import { NextRequest, NextResponse } from "next/server";
import { getPlayer } from "@/lib/repository";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet")?.trim();
  if (!wallet) {
    return NextResponse.json({ error: "wallet required" }, { status: 400 });
  }

  const player = await getPlayer(wallet);
  return NextResponse.json(player);
}
