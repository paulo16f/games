import { NextResponse } from "next/server";
import { ProductionReadinessError } from "./config";

export function apiError(error: unknown, fallback = "Internal server error"): NextResponse {
  if (error instanceof ProductionReadinessError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof Error) {
    return NextResponse.json({ error: error.message || fallback }, { status: 400 });
  }
  return NextResponse.json({ error: fallback }, { status: 500 });
}
