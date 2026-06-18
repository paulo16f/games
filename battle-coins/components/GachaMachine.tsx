"use client";
import { useState, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import GachaCard from "./GachaCard";
import { GACHA_TIERS, GachaTier, PUMP_FUN_URL, PUMP_GATE_AMOUNT } from "@/lib/constants";
import { Equipment, PlayerState } from "@/lib/store";

interface Props {
  tokenBalance: number;
  realTokenBalance: number;
  tokenSymbol: string;
  onPullComplete: (data: PlayerState) => void;
  totalPulls: number;
}

type MachineState = "idle" | "rolling" | "revealed";

interface PullHistory {
  tier: GachaTier;
  item: Equipment | null;
}

function buildTweetUrl(tier: GachaTier, tokenSymbol: string): string {
  const medal = tier.id === 5 ? "🌈 ULTRA" : "⭐ LEGENDARY";
  const text = `I just pulled ${medal} on Battle Coins Gacha! 🎮 Hold $${tokenSymbol} to play 👇 #pumpfun #solana`;
  const url = typeof window !== "undefined" ? window.location.origin : "";
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
}

export default function GachaMachine({
  tokenBalance,
  realTokenBalance,
  tokenSymbol,
  onPullComplete,
  totalPulls,
}: Props) {
  const { publicKey } = useWallet();
  const [state, setState] = useState<MachineState>("idle");
  const [result, setResult] = useState<GachaTier | null>(null);
  const [pulledItem, setPulledItem] = useState<Equipment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pullHistory, setPullHistory] = useState<PullHistory[]>([]);
  const [autoSoldMsg, setAutoSoldMsg] = useState<string | null>(null);

  const isGated = realTokenBalance < PUMP_GATE_AMOUNT;
  const canPull = publicKey && tokenBalance >= 1 && state === "idle" && !isGated;

  const pull = useCallback(async () => {
    if (!publicKey || !canPull) return;
    setError(null);
    setState("rolling");

    try {
      const res = await fetch("/api/game/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "pull", wallet: publicKey.toString() }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Pull failed");
      }
      const data = await res.json() as {
        playerData: PlayerState;
        result: { tierId: number; tierName: string; rewardTokens: number; item: Equipment | null; autoSold: boolean; autoSellTokens: number };
      };

      const tier = GACHA_TIERS.find((t) => t.id === data.result.tierId) ?? GACHA_TIERS[0];
      const item = data.result.item ?? null;
      const autoSold = data.result.autoSold ?? false;
      const autoSellTokens = data.result.autoSellTokens ?? 0;

      await new Promise((r) => setTimeout(r, 900));
      setResult(tier);
      setPulledItem(autoSold ? null : item);
      setState("revealed");
      if (autoSold) setAutoSoldMsg(`Inventory full! Auto-sold +${autoSellTokens}🪙`);
      setPullHistory((prev) => [{ tier, item }, ...prev].slice(0, 10));
      onPullComplete(data.playerData);

      setTimeout(() => {
        setState("idle");
        setPulledItem(null);
        setAutoSoldMsg(null);
      }, 5000);
    } catch (e) {
      console.error(e);
      setError(String(e));
      setState("idle");
    }
  }, [publicKey, canPull, onPullComplete]);

  const isUltra = result?.id === 5;
  const isShareWorthy = result && (result.id === 4 || result.id === 5);

  return (
    <div className="space-y-6">
      {isUltra && state === "revealed" && (
        <div className="fixed inset-0 z-40 pointer-events-none gacha-ultra-flash" />
      )}

      <div className="text-center space-y-1">
        <h2 className="text-2xl font-black text-white tracking-tight">✦ Gacha Machine</h2>
        <p className="text-gray-400 text-sm">Burn 1 🪙 — get gear and tokens</p>
      </div>

      {/* Card area */}
      <div className="flex flex-col justify-center items-center min-h-72 gap-3">
        {state === "idle" && (
          <div className="w-48 h-64 rounded-2xl border-2 border-dashed border-white/20 flex flex-col items-center justify-center gap-3 text-white/30">
            <div className="text-5xl">🎴</div>
            <div className="text-sm">{isGated ? `Hold $${tokenSymbol} to pull` : "Pull to reveal"}</div>
          </div>
        )}

        {state === "rolling" && (
          <div className="w-48 h-64 rounded-2xl border-2 border-white/30 bg-white/5 flex flex-col items-center justify-center gap-3">
            <div className="text-4xl gacha-question-spin">❓</div>
          </div>
        )}

        {state === "revealed" && result && (
          <div className={`flex flex-col items-center gap-3 ${isUltra ? "gacha-ultra-shake" : ""}`}>
            <GachaCard tier={result} isRevealed={true} />
            {autoSoldMsg ? (
              <div className="text-center text-yellow-400 text-xs font-semibold px-2">{autoSoldMsg}</div>
            ) : pulledItem ? (
              <div className="text-center space-y-0.5">
                <div className="text-2xl">{pulledItem.emoji}</div>
                <div className={`text-sm font-bold ${GACHA_TIERS.find(t => t.id === pulledItem.tierId)?.textClass ?? "text-white"}`}>
                  {pulledItem.name}
                </div>
                <div className="text-xs text-white/50">
                  {pulledItem.atk > 0 && pulledItem.def > 0
                    ? `+${pulledItem.atk} ATK / +${pulledItem.def} DEF`
                    : pulledItem.atk > 0 ? `+${pulledItem.atk} ATK` : `+${pulledItem.def} DEF`
                  } → Added to inventory
                </div>
              </div>
            ) : null}
            {isShareWorthy && (
              <a
                href={buildTweetUrl(result, tokenSymbol)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#1DA1F2]/20 border border-[#1DA1F2]/40 text-[#1DA1F2] text-sm font-bold hover:bg-[#1DA1F2]/30 transition-all"
              >
                𝕏 Share on X
              </a>
            )}
          </div>
        )}
      </div>

      {/* Token gate notice */}
      {publicKey && isGated && (
        <a
          href={PUMP_FUN_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full py-4 rounded-2xl text-center font-black text-lg bg-gradient-to-r from-green-700 to-emerald-600 text-white hover:opacity-90 transition-all shadow-lg shadow-green-900/40"
        >
          🛒 Buy ${tokenSymbol} on Pump.fun to unlock pulls
        </a>
      )}

      {/* Pull button */}
      {!isGated && (
        <button
          onClick={pull}
          disabled={!canPull}
          className={`
            w-full py-4 rounded-2xl font-black text-lg tracking-wider transition-all
            ${canPull
              ? "bg-gradient-to-r from-violet-600 via-purple-600 to-blue-600 text-white hover:opacity-90 hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-purple-900/50"
              : "bg-white/5 text-white/30 cursor-not-allowed"}
          `}
        >
          {state === "rolling"  ? "✨ Revealing…"    :
           state === "revealed" ? "⏳ Resetting…"    :
           !publicKey           ? "Connect Wallet"   :
           tokenBalance < 1     ? "Need 1 🪙 to Pull" :
           "🎴 PULL (costs 1 🪙)"}
        </button>
      )}

      {error && <p className="text-center text-red-400 text-sm">{error}</p>}

      {/* Rates table */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
        <div className="text-white/50 text-xs font-semibold uppercase tracking-wider mb-3">Rates & Rewards</div>
        <div className="space-y-1.5">
          {GACHA_TIERS.map((t) => (
            <div key={t.id} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span>{t.emoji}</span>
                <span className={t.textClass}>{t.name}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-white/40 text-xs">
                  {t.id === 1 ? "no gear" : t.rewardTokens > 0 ? `gear +${t.rewardTokens} 🪙` : "gear"}
                </span>
                <span className="text-white/60 font-mono text-xs w-12 text-right">{t.probability}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Pull history */}
      {pullHistory.length > 0 && (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
          <div className="text-white/50 text-xs font-semibold uppercase tracking-wider mb-3">
            Recent Pulls ({totalPulls} total)
          </div>
          <div className="flex flex-wrap gap-2">
            {pullHistory.map(({ tier, item }, i) => (
              <span
                key={i}
                className={`text-xs px-2 py-1 rounded-lg border ${tier.borderClass} ${tier.textClass} bg-white/5`}
                title={item ? `${tier.name} — ${item.name}` : tier.name}
              >
                {tier.emoji} {item ? item.emoji : tier.rewardTokens > 0 ? `+${tier.rewardTokens}` : ""}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
