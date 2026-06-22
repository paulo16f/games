import { NextRequest, NextResponse } from "next/server";
import { checkRunningToadsGate } from "@/lib/token-gate";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet")?.trim();
  if (!wallet) {
    return NextResponse.json({ error: "wallet required" }, { status: 400 });
  }

  try {
    const result = await checkRunningToadsGate(wallet);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: "Invalid wallet address", gated: false },
      { status: 400 }
    );
  }
}
