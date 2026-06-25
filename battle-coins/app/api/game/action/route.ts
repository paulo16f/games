import { NextRequest, NextResponse } from "next/server";
import {
  GameActionError,
  handleGameAction,
  isGameAction,
} from "@/lib/game-engine";
import { getOrCreatePlayer, savePlayer } from "@/lib/repository";
import { kvConfigured } from "@/lib/config";
import { checkToadJumpGate } from "@/lib/token-gate";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      action?: unknown;
      wallet?: unknown;
      toadId?: string;
      amount?: number;
      creatorKey?: string;
      nickname?: string;
    };

    if (!isGameAction(body.action) || typeof body.wallet !== "string" || !body.wallet.trim()) {
      return NextResponse.json({ error: "Missing or invalid action or wallet" }, { status: 400 });
    }

    const gate = await checkToadJumpGate(body.wallet.trim());
    const state = await getOrCreatePlayer(gate.wallet || body.wallet.trim());
    state.tokenBalance = gate.balance;
    state.lastVerifiedAt = Date.now();

    const result = await handleGameAction(state, gate, {
      action: body.action,
      toadId: body.toadId,
      amount: body.amount,
      creatorKey: body.creatorKey,
      nickname: body.nickname,
    });
    const playerData = await savePlayer(state);

    return NextResponse.json({ playerData, result, gate, kvOk: kvConfigured() });
  } catch (error) {
    if (error instanceof GameActionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
