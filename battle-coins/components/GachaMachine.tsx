"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import GachaCard from "./GachaCard";
import { GACHA_TIERS, GachaTier, PUMP_FUN_URL, PUMP_GATE_AMOUNT, STAR_MULTIPLIERS } from "@/lib/constants";
import { Fighter, PlayerState } from "@/lib/store";

interface Props {
  tokenBalance: number;
  realTokenBalance: number;
  tokenSymbol: string;
  onPullComplete: (data: PlayerState) => void;
  totalPulls: number;
  lastDailySummonDate: string;
}

type MachineState = "idle" | "rolling" | "revealed";

interface PullHistory {
  tier: GachaTier;
  fighter: Fighter;
  isNew: boolean;
  starsUp: boolean;
}

interface PendingResult {
  tier: GachaTier;
  fighter: Fighter;
  isNew: boolean;
  starsUp: boolean;
}

function buildTweetUrl(tier: GachaTier, tokenSymbol: string): string {
  const medal = tier.id === 5 ? "🌈 Mythic" : "⭐ Legendary";
  const text = `I just pulled ${medal} on Battle Coins Gacha! 🎮 Hold $${tokenSymbol} to play 👇 #pumpfun #solana`;
  const url = typeof window !== "undefined" ? window.location.origin : "";
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
}

function stars(n: number): string {
  return "★".repeat(n) + "☆".repeat(5 - n);
}

export default function GachaMachine({
  tokenBalance,
  realTokenBalance,
  tokenSymbol,
  onPullComplete,
  totalPulls,
  lastDailySummonDate,
}: Props) {
  const { publicKey } = useWallet();
  const [machineState, setMachineState] = useState<MachineState>("idle");
  const [result, setResult] = useState<GachaTier | null>(null);
  const [pulledFighter, setPulledFighter] = useState<Fighter | null>(null);
  const [fighterIsNew, setFighterIsNew] = useState(false);
  const [fighterStarsUp, setFighterStarsUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pullHistory, setPullHistory] = useState<PullHistory[]>([]);

  const [displayTier, setDisplayTier] = useState<GachaTier>(GACHA_TIERS[0]);
  const pendingResult = useRef<PendingResult | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const isGated = realTokenBalance < PUMP_GATE_AMOUNT;
  const canPull = publicKey && tokenBalance >= 1 && machineState === "idle" && !isGated;
  const canDailySummon = !!publicKey && !isGated && lastDailySummonDate !== today && machineState === "idle";

  // ── Chest animation (slot reel drives glow color) ───────────────────────
  useEffect(() => {
    if (machineState !== "rolling") return;

    const startTime = Date.now();
    let speed = 55;
    let tierIdx = Math.floor(Math.random() * GACHA_TIERS.length);
    let handle: ReturnType<typeof setTimeout>;
    let stopped = false;

    const tick = () => {
      if (stopped) return;
      tierIdx = (tierIdx + 1) % GACHA_TIERS.length;
      setDisplayTier(GACHA_TIERS[tierIdx]);

      const elapsed = Date.now() - startTime;
      const hasResult = pendingResult.current !== null;

      if (hasResult && elapsed >= 550) {
        speed = speed * 1.45;
        if (speed >= 400) {
          stopped = true;
          const res = pendingResult.current!;
          setDisplayTier(res.tier);
          setResult(res.tier);
          setPulledFighter(res.fighter);
          setFighterIsNew(res.isNew);
          setFighterStarsUp(res.starsUp);
          setPullHistory(prev => [
            { tier: res.tier, fighter: res.fighter, isNew: res.isNew, starsUp: res.starsUp },
            ...prev,
          ].slice(0, 10));
          setMachineState("revealed");
          setTimeout(() => {
            setMachineState("idle");
            setPulledFighter(null);
          }, 4000);
          return;
        }
      }
      handle = setTimeout(tick, speed);
    };

    handle = setTimeout(tick, speed);
    return () => { stopped = true; clearTimeout(handle); };
  }, [machineState]);

  // ── Shared summon result handler ────────────────────────────────────────
  function handleSummonResult(data: { playerData: PlayerState; result: { tierId: number; tierName: string; rewardTokens: number; fighter: Fighter; starsUp: boolean; isNew: boolean } }) {
    const tier = GACHA_TIERS.find(t => t.id === data.result.tierId) ?? GACHA_TIERS[0];
    pendingResult.current = {
      tier,
      fighter: data.result.fighter,
      isNew: data.result.isNew,
      starsUp: data.result.starsUp,
    };
    onPullComplete(data.playerData);
  }

  // ── Pull ────────────────────────────────────────────────────────────────
  const pull = useCallback(async () => {
    if (!publicKey || !canPull) return;
    setError(null);
    pendingResult.current = null;
    setMachineState("rolling");
    try {
      const res = await fetch("/api/game/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "pull", wallet: publicKey.toString() }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? "Pull failed"); }
      handleSummonResult(await res.json());
    } catch (e) {
      console.error(e);
      setError(String(e));
      setMachineState("idle");
    }
  }, [publicKey, canPull, onPullComplete]);

  // ── Daily summon ────────────────────────────────────────────────────────
  const dailySummon = useCallback(async () => {
    if (!publicKey || !canDailySummon) return;
    setError(null);
    pendingResult.current = null;
    setMachineState("rolling");
    try {
      const res = await fetch("/api/game/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "daily_summon", wallet: publicKey.toString() }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? "Summon failed"); }
      handleSummonResult(await res.json());
    } catch (e) {
      console.error(e);
      setError(String(e));
      setMachineState("idle");
    }
  }, [publicKey, canDailySummon, onPullComplete]);

  const isUltra = result?.id === 5;
  const isShareWorthy = result && result.id >= 4;
  const fighterPower = pulledFighter
    ? Math.round(pulledFighter.basePower * STAR_MULTIPLIERS[Math.min(pulledFighter.stars - 1, 4)])
    : 0;

  return (
    <div className="space-y-5">

      {isUltra && machineState === "revealed" && (
        <div className="fixed inset-0 z-40 pointer-events-none gacha-ultra-flash" />
      )}

      {/* ── RPG Treasure Chest ───────────────────────────────────────── */}
      <div className="flex flex-col items-center gap-4 min-h-64 justify-center">

        <div
          className={machineState === "rolling" ? "animate-chest-shake" : ""}
          style={{
            filter: machineState === "idle"
              ? "drop-shadow(0 0 10px rgba(201,153,62,0.5))"
              : `drop-shadow(0 0 20px ${displayTier.color}) drop-shadow(0 0 40px ${displayTier.color}88)`,
            transition: "filter 0.08s",
          }}
        >
          <div style={{ perspective: "520px", perspectiveOrigin: "50% 85%" }}>
            <div
              className={machineState === "revealed" ? "chest-lid-open" : ""}
              style={{
                width: "11rem", height: "3.5rem",
                background: "linear-gradient(160deg, #8B5828 0%, #5C3315 60%, #3D1F0A 100%)",
                borderRadius: "55% 55% 4px 4px / 50% 50% 4px 4px",
                border: "2.5px solid #C9993E", borderBottom: "none",
                position: "relative", transformOrigin: "50% 100%",
              }}
            >
              <div style={{ position: "absolute", bottom: "8px", left: "14px", right: "14px", height: "6px", background: "rgba(201,153,62,0.4)", borderTop: "1px solid rgba(201,153,62,0.6)", borderRadius: "2px" }} />
              <div style={{ position: "absolute", top: "7px", left: "28%", right: "28%", height: "2px", background: "rgba(255,220,120,0.22)", borderRadius: "50%" }} />
            </div>
          </div>

          <div style={{ position: "relative", height: 0 }}>
            <div style={{ position: "absolute", top: "-1px", left: "8%", right: "8%", height: "2px",
              background: machineState !== "idle" ? `linear-gradient(90deg, transparent, ${displayTier.color}, transparent)` : "transparent",
              boxShadow: machineState === "rolling" ? `0 0 10px 3px ${displayTier.color}` : "none",
              transition: "all 0.08s" }} />
            <div style={{ position: "absolute", top: "-20px", left: "50%", transform: "translateX(-50%)",
              display: "flex", flexDirection: "column", alignItems: "center", zIndex: 30,
              opacity: machineState === "revealed" ? 0 : 1, transition: "opacity 0.15s" }}>
              <div style={{ width: "15px", height: "9px", border: "2.5px solid #F0D060", borderBottom: "none", borderRadius: "8px 8px 0 0" }} />
              <div style={{ width: "21px", height: "15px", background: "linear-gradient(180deg, #D4A017, #9A6F10)", border: "2px solid #F0D060", borderRadius: "3px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ width: "5px", height: "5px", background: "#4A2800", borderRadius: "50%" }} />
              </div>
            </div>
          </div>

          <div style={{ width: "11rem", height: "6rem",
            background: "linear-gradient(180deg, #5C3315 0%, #3D1F0A 100%)",
            borderRadius: "0 0 10px 10px", border: "2.5px solid #C9993E",
            borderTop: "2px solid #7A4A18", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: "10px", left: 0, right: 0, height: "10px", background: "rgba(201,153,62,0.35)", borderTop: "1px solid rgba(201,153,62,0.55)", borderBottom: "1px solid rgba(201,153,62,0.25)" }} />
            <div style={{ position: "absolute", bottom: "8px", left: 0, right: 0, height: "6px", background: "rgba(201,153,62,0.22)", borderTop: "1px solid rgba(201,153,62,0.38)" }} />
            <div style={{ position: "absolute", left: "50%", top: "58%", width: "15px", height: "15px", background: "rgba(201,153,62,0.45)", border: "1.5px solid rgba(201,153,62,0.65)", transform: "translate(-50%, -50%) rotate(45deg)" }} />
            <div style={{
              position: "absolute", inset: 0,
              background: machineState === "rolling"
                ? `radial-gradient(ellipse at 50% -15%, ${displayTier.color}55 0%, transparent 70%)`
                : machineState === "revealed"
                ? `radial-gradient(ellipse at 50% -15%, ${result?.color ?? "#f59e0b"}99 0%, transparent 85%)`
                : "transparent",
              transition: machineState === "rolling" ? "background 0.08s" : "background 0.5s",
            }} />
          </div>
        </div>

        {/* Status text */}
        <div className="text-center min-h-5">
          {machineState === "idle" && <div className="text-white/30 text-sm">⚔️ A chest lies before you...</div>}
          {machineState === "rolling" && (
            <div className="text-sm font-bold tracking-wide" style={{ color: displayTier.color, textShadow: `0 0 12px ${displayTier.color}`, transition: "color 0.08s" }}>
              ✨ The chest trembles...
            </div>
          )}
        </div>

        {/* Revealed — fighter rises from chest */}
        {machineState === "revealed" && result && (
          <div className={`flex flex-col items-center gap-3 animate-item-rise ${isUltra ? "gacha-ultra-shake" : ""}`}>
            <GachaCard tier={result} isRevealed={true} />
            {pulledFighter && (
              <div className="text-center space-y-1">
                {fighterIsNew
                  ? <div className="text-emerald-400 text-xs font-bold uppercase tracking-widest">✨ New Fighter!</div>
                  : fighterStarsUp
                    ? <div className="text-yellow-400 text-xs font-bold">⭐ Star Up! → {stars(pulledFighter.stars)}</div>
                    : <div className="text-purple-400 text-xs font-bold">💰 Max ★ — Tokens instead</div>
                }
                <div className="text-4xl">{pulledFighter.emoji}</div>
                <div className={`text-base font-black ${GACHA_TIERS.find(t => t.id === pulledFighter.tierId)?.textClass ?? "text-white"}`}>
                  {pulledFighter.name}
                </div>
                <div className="text-yellow-400 text-sm tracking-widest">{stars(pulledFighter.stars)}</div>
                <div className="text-white/50 text-xs">⚡ {fighterPower.toLocaleString()} power</div>
              </div>
            )}
            {isShareWorthy && (
              <a href={buildTweetUrl(result, tokenSymbol)} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#1DA1F2]/20 border border-[#1DA1F2]/40 text-[#1DA1F2] text-sm font-bold hover:bg-[#1DA1F2]/30 transition-all">
                𝕏 Share on X
              </a>
            )}
          </div>
        )}
      </div>

      {/* ── Token gate ───────────────────────────────────────────────── */}
      {publicKey && isGated && (
        <a href={PUMP_FUN_URL} target="_blank" rel="noopener noreferrer"
          className="block w-full py-4 rounded-2xl text-center font-black text-lg bg-gradient-to-r from-green-700 to-emerald-600 text-white hover:opacity-90 transition-all shadow-lg shadow-green-900/40">
          🛒 Buy ${tokenSymbol} on Pump.fun to unlock
        </a>
      )}

      {!isGated && (
        <div className="space-y-2">
          {/* Daily summon */}
          {publicKey && (
            <button onClick={dailySummon} disabled={!canDailySummon}
              className={`w-full py-3 rounded-2xl font-bold text-base transition-all ${
                canDailySummon
                  ? "bg-gradient-to-r from-emerald-700 to-green-600 text-white hover:opacity-90 hover:scale-[1.01] shadow-lg shadow-emerald-900/40"
                  : "bg-white/5 text-white/20 cursor-not-allowed"
              }`}>
              {canDailySummon ? "🎁 DAILY SUMMON — FREE" : "🎁 Daily summon used — come back tomorrow"}
            </button>
          )}

          {/* Paid pull */}
          <button onClick={pull} disabled={!canPull}
            className={`w-full py-4 rounded-2xl font-black text-lg tracking-wider transition-all ${
              canPull
                ? "bg-gradient-to-r from-violet-600 via-purple-600 to-blue-600 text-white hover:opacity-90 hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-purple-900/50"
                : machineState === "rolling"
                  ? "bg-purple-900/40 text-purple-300/60 cursor-not-allowed"
                  : "bg-white/5 text-white/30 cursor-not-allowed"
            }`}>
            {machineState === "rolling"  ? "🎰 Opening chest…"   :
             machineState === "revealed" ? "⏳ Next pull in…"     :
             !publicKey                  ? "Connect Wallet"       :
             tokenBalance < 1            ? "Need 1 🪙 to Pull"    :
                                           "🎴 PULL  —  1 🪙"}
          </button>
        </div>
      )}

      {error && <p className="text-center text-red-400 text-sm">{error}</p>}

      {/* ── Rates ────────────────────────────────────────────────────── */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
        <div className="text-white/40 text-xs font-semibold uppercase tracking-wider mb-3">Rates</div>
        <div className="space-y-1.5">
          {GACHA_TIERS.map(t => (
            <div key={t.id} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span>{t.emoji}</span>
                <span className={t.textClass}>{t.name}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-white/30 text-xs">
                  {t.rewardTokens > 0 ? `+${t.rewardTokens}🪙` : "fighter"}
                </span>
                <span className="text-white/60 font-mono text-xs w-12 text-right">{t.probability}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Pull history ─────────────────────────────────────────────── */}
      {pullHistory.length > 0 && (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
          <div className="text-white/40 text-xs font-semibold uppercase tracking-wider mb-3">
            Recent · {totalPulls} total
          </div>
          <div className="flex flex-wrap gap-2">
            {pullHistory.map(({ tier, fighter, isNew, starsUp }, i) => (
              <span key={i}
                className={`text-xs px-2 py-1 rounded-lg border ${tier.borderClass} ${tier.textClass} bg-white/5`}
                title={`${fighter.name} ${isNew ? "(NEW)" : starsUp ? "(★+1)" : "(max★)"}`}>
                {fighter.emoji} {isNew ? "NEW" : starsUp ? "★+1" : "💰"}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
