import { NextRequest, NextResponse } from "next/server";
import { store, DEFAULT_STATE } from "@/lib/store";

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet");
  if (!wallet) {
    return NextResponse.json({ error: "wallet required" }, { status: 400 });
  }
  const state = store.get(wallet) ?? DEFAULT_STATE();
  return NextResponse.json(state);
}
