import { NextResponse } from "next/server";
import { eggRateTable } from "@/lib/gacha-engine";

export async function GET() {
  return NextResponse.json({ rates: eggRateTable });
}
