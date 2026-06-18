import { NextRequest, NextResponse } from "next/server";
import { rollGachaTier } from "@/lib/gacha";

export async function POST(req: NextRequest) {
  try {
    const { walletAddress, txSignature } = await req.json();

    if (!walletAddress || !txSignature) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Server-side random roll (crypto.getRandomValues equivalent on server)
    const tier = rollGachaTier();

    return NextResponse.json({
      tierId: tier.id,
      tierName: tier.name,
      rewardTokens: tier.rewardTokens,
      walletAddress,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
