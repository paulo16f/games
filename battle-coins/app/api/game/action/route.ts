import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import {
  GameActionError,
  handleGameAction,
  isGameAction,
} from "@/lib/game-engine";
import { getOrCreatePlayer, savePlayer } from "@/lib/repository";
import { kvConfigured } from "@/lib/config";
import { pgConfigured, withPostgresAdvisoryLock } from "@/lib/db";
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

    if (!isGameAction(body.action)) {
      return NextResponse.json({ error: "Missing or invalid action" }, { status: 400 });
    }
    const action = body.action;

    const session = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
    if (!session) {
      return NextResponse.json({ error: "Wallet signature session required" }, { status: 401 });
    }

    return await withPostgresAdvisoryLock(`wallet:${session.wallet}`, async () => {
      const gate = await checkToadJumpGate(session.wallet);
      const state = await getOrCreatePlayer(gate.wallet || session.wallet);
      state.tokenBalance = gate.balance;
      state.lastVerifiedAt = Date.now();

      const runAction = () => handleGameAction(state, gate, {
        action,
        toadId: body.toadId,
        amount: body.amount,
        creatorKey: body.creatorKey,
        nickname: body.nickname,
      });
      const result = action === "claim_24h_reward"
        ? await withPostgresAdvisoryLock("ledger:payouts", runAction)
        : await runAction();
      const playerData = await savePlayer(state);

      return NextResponse.json({ playerData, result, gate, kvOk: kvConfigured(), pgOk: pgConfigured() });
    });
  } catch (error) {
    if (error instanceof GameActionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error(error);
    return apiError(error);
  }
}
