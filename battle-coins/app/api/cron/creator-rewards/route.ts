import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { toadJumpConfig } from "@/lib/config";
import { getLedger, saveLedger } from "@/lib/repository";
import { autoDistributeRewards } from "@/lib/reward-engine";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface SolanaSignatureInfo {
  signature: string;
  err: unknown;
}

interface SolanaTransaction {
  transaction?: {
    message?: {
      accountKeys?: string[];
    };
  };
  meta?: {
    err: unknown;
    preBalances?: number[];
    postBalances?: number[];
  };
}

interface RpcResponse<T> {
  result?: T;
  error?: { message: string };
}

async function rpcCall<T>(url: string, body: unknown): Promise<T | null> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const data = await res.json() as RpcResponse<T>;
  return data.result ?? null;
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (cronSecret) {
    const provided = authHeader?.replace("Bearer ", "") ?? "";
    const secretBuf = Buffer.from(cronSecret);
    const providedBuf = Buffer.from(provided);
    if (
      provided.length !== cronSecret.length ||
      !crypto.timingSafeEqual(secretBuf, providedBuf)
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const { treasuryWallet, rpcUrl } = toadJumpConfig;
  if (!treasuryWallet) {
    return NextResponse.json({ error: "TREASURY_WALLET not configured" }, { status: 503 });
  }

  const ledger = await getLedger();
  const until = ledger.lastProcessedSignature || undefined;

  let signatures: SolanaSignatureInfo[] | null;
  try {
    signatures = await rpcCall<SolanaSignatureInfo[]>(rpcUrl, {
      jsonrpc: "2.0",
      id: 1,
      method: "getSignaturesForAddress",
      params: [treasuryWallet, { limit: 50, ...(until ? { until } : {}) }],
    });
  } catch (err) {
    console.error("[cron:creator-rewards] getSignaturesForAddress failed", err);
    return NextResponse.json({ error: "RPC fetch failed", synced: 0 }, { status: 502 });
  }

  if (!signatures || signatures.length === 0) {
    ledger.lastAutoSyncAt = Date.now();
    ledger.autoSyncCount += 1;
    await saveLedger(ledger);
    const distribution = await autoDistributeRewards();
    return NextResponse.json({ synced: 0, totalSol: 0, noNewTransactions: true, distribution });
  }

  const validSigs = signatures.filter((s) => !s.err);

  let txArray: Array<RpcResponse<SolanaTransaction>>;
  try {
    const txBatchRes = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        validSigs.map((s, i) => ({
          jsonrpc: "2.0",
          id: i + 1,
          method: "getTransaction",
          params: [s.signature, { encoding: "json", maxSupportedTransactionVersion: 0 }],
        }))
      ),
      cache: "no-store",
    });
    const txBatch = await txBatchRes.json() as Array<RpcResponse<SolanaTransaction>>;
    txArray = Array.isArray(txBatch) ? txBatch : [txBatch];
  } catch (err) {
    console.error("[cron:creator-rewards] getTransaction batch failed", err);
    return NextResponse.json({ error: "RPC batch fetch failed", synced: 0 }, { status: 502 });
  }

  let totalLamports = 0;
  let processedCount = 0;

  for (const txResponse of txArray) {
    const tx = txResponse.result;
    if (!tx || tx.meta?.err) continue;

    const accountKeys = tx.transaction?.message?.accountKeys ?? [];
    const idx = accountKeys.indexOf(treasuryWallet);
    if (idx === -1) continue;

    const pre = tx.meta?.preBalances?.[idx] ?? 0;
    const post = tx.meta?.postBalances?.[idx] ?? 0;
    const delta = post - pre;
    if (delta > 0) {
      totalLamports += delta;
      processedCount++;
    }
  }

  const totalSol = totalLamports / 1e9;
  const newestSignature = signatures[0].signature;

  if (totalSol > 0) {
    ledger.creatorRewardsRecorded += totalSol;
    ledger.dailyActivePool += totalSol;
    ledger.holderRewardsPool += totalSol;
    ledger.totalReturnedToProject += totalSol;
    ledger.racePool += totalSol * 0.20;
  }

  ledger.lastProcessedSignature = newestSignature;
  ledger.lastAutoSyncAt = Date.now();
  ledger.autoSyncCount += 1;

  await saveLedger(ledger);

  // Auto-distribute daily rewards to all active players
  const distribution = await autoDistributeRewards();

  return NextResponse.json({
    synced: processedCount,
    totalSol,
    signatures: signatures.length,
    lastProcessedSignature: newestSignature,
    autoSyncCount: ledger.autoSyncCount,
    distribution,
  });
}
