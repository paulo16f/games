import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { assertCronAuth, settleRaceWindows } from "@/lib/race-settlement";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const authError = assertCronAuth(req.headers.get("authorization"));
  if (authError) return authError;

  try {
    const result = await settleRaceWindows();
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error);
  }
}
