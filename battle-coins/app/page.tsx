"use client";
import { useState, useCallback, useEffect } from "react";
import WalletButton from "@/components/WalletButton";
import BattleSection from "@/components/BattleSection";
import GachaMachine from "@/components/GachaMachine";
import FighterCollection from "@/components/FighterCollection";
import ArenaLadder from "@/components/ArenaLadder";
import { useWallet } from "@solana/wallet-adapter-react";
import { PlayerState } from "@/lib/store";
import { PUMP_FUN_URL } from "@/lib/constants";

type Tab = "battle" | "gacha" | "fighters" | "arena";

const TABS: { id: Tab; icon: string; label: string; color: string; glow: string }[] = [
  { id: "battle",   icon: "⚔️", label: "Battle",   color: "text-red-400",    glow: "border-red-500/50 bg-red-500/10"       },
  { id: "gacha",    icon: "🎰", label: "Gacha",    color: "text-purple-400", glow: "border-purple-500/50 bg-purple-500/10" },
  { id: "fighters", icon: "🃏", label: "Fighters", color: "text-blue-400",   glow: "border-blue-500/50 bg-blue-500/10"    },
  { id: "arena",    icon: "🏆", label: "Arena",    color: "text-yellow-400", glow: "border-yellow-500/50 bg-yellow-500/10" },
];

export default function Home() {
  const { publicKey } = useWallet();
  const [playerData, setPlayerData] = useState<PlayerState | null>(null);
  const [realTokenBalance, setRealTokenBalance] = useState(0);
  const [tokenSymbol, setTokenSymbol] = useState("TOKEN");
  const [activeTab, setActiveTab] = useState<Tab>("battle");

  const handlePlayerDataUpdate = useCallback((data: PlayerState) => {
    setPlayerData(data);
  }, []);

  useEffect(() => {
    if (!publicKey) { setRealTokenBalance(0); return; }
    fetch(`/api/token/balance?wallet=${publicKey.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        setRealTokenBalance(d.balance ?? 0);
        if (d.symbol) setTokenSymbol(d.symbol);
      })
      .catch(() => {});
  }, [publicKey]);

  const tokenBalance        = playerData?.tokens ?? 0;
  const totalPulls          = playerData?.totalPulls ?? 0;
  const hp                  = playerData?.health ?? 100;
  const killStreak          = playerData?.killStreak ?? 0;
  const arenaRating         = playerData?.arenaRating ?? 100;
  const lastDailySummonDate = playerData?.lastDailySummonDate ?? "";

  const fmtBalance = (n: number) =>
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` :
    n >= 1_000     ? `${(n / 1_000).toFixed(1)}K`     :
    n.toLocaleString(undefined, { maximumFractionDigits: 2 });

  const activeTabMeta = TABS.find((t) => t.id === activeTab)!;

  return (
    <div className="relative min-h-screen z-10 flex flex-col">

      {/* ── HUD Header ──────────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 border-b border-white/8 backdrop-blur-2xl bg-black/50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-4">

          {/* Logo */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xl">⚔️</span>
            <div className="leading-none">
              <div className="font-black text-base tracking-tight">
                <span className="text-white">BATTLE</span>
                <span className="text-yellow-400">COINS</span>
              </div>
              <div className="text-red-500/60 text-[9px] font-bold tracking-[0.2em] uppercase">Gacha Wars</div>
            </div>
          </div>

          {/* Inline HUD stats (when playing) */}
          {publicKey && playerData && (
            <div className="hidden sm:flex items-center gap-3 ml-2">
              {/* HP */}
              <div className="flex items-center gap-1.5">
                <span className="text-red-400 text-[10px] font-bold tracking-wider">HP</span>
                <div className="w-14 h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${hp > 60 ? "bg-green-500" : hp > 30 ? "bg-yellow-500" : "bg-red-500"}`}
                    style={{ width: `${hp}%` }}
                  />
                </div>
                <span className="text-white/50 text-[10px] font-mono">{hp}</span>
              </div>

              {/* Kill streak */}
              {killStreak >= 3 && (
                <div className="flex items-center gap-1 bg-orange-500/15 border border-orange-500/30 rounded px-1.5 py-0.5">
                  <span className="text-orange-400 text-[10px] font-black">🔥 ×{killStreak}</span>
                </div>
              )}
            </div>
          )}

          <div className="flex-1" />

          {/* Right: token balances + wallet */}
          <div className="flex items-center gap-2">
            {publicKey && (
              <>
                <a
                  href={PUMP_FUN_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hidden sm:flex items-center gap-1 bg-emerald-950/60 border border-emerald-600/30 rounded-lg px-2.5 py-1.5 hover:border-emerald-500/50 transition-all"
                  title="$TOKEN — Pump.fun on-chain token (hold to access game)"
                >
                  <span className="text-emerald-400 text-xs font-black">{fmtBalance(realTokenBalance)}</span>
                  <span className="text-emerald-600 text-[10px] font-bold">${tokenSymbol}</span>
                </a>
                <div className="flex items-center gap-1 bg-yellow-950/60 border border-yellow-600/30 rounded-lg px-2.5 py-1.5" title="COIN — in-game currency earned from farming">
                  <span className="text-yellow-400 text-xs">🪙</span>
                  <span className="text-yellow-300 text-xs font-black">{tokenBalance}</span>
                  <span className="text-yellow-600/60 text-[10px]">COIN</span>
                </div>
              </>
            )}
            <WalletButton />
          </div>
        </div>
      </header>

      {/* ── Content ─────────────────────────────────────────────────── */}
      {!publicKey ? (
        /* ── Landing ──────────────────────────────────────────────── */
        <main className="flex-1 flex flex-col items-center justify-center px-4 py-12 text-center">
          <div className="max-w-2xl w-full space-y-10">

            {/* Hero title */}
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-full px-4 py-1.5 text-red-400 text-xs font-bold tracking-wider uppercase mb-2">
                ⚡ Live on Solana Mainnet
              </div>
              <h1 className="text-6xl sm:text-7xl font-black tracking-tighter leading-none">
                <span className="text-white">BATTLE</span>
                <br />
                <span style={{ background: "linear-gradient(135deg, #fbbf24, #f97316, #ef4444)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                  COINS
                </span>
              </h1>
              <p className="text-white/40 text-lg font-medium">Gacha · Combat · Earn</p>
            </div>

            {/* Feature cards */}
            <div className="grid grid-cols-3 gap-3 text-left">
              {[
                { icon: "⚔️", title: "Deep Combat", desc: "Crits, combos, elemental weaknesses & counter attacks", color: "border-red-500/30 bg-red-500/5" },
                { icon: "🎰", title: "Fighter Gacha", desc: "Common to Mythic 0.1% — collect & star-up fighters with every pull", color: "border-purple-500/30 bg-purple-500/5" },
                { icon: "🏆", title: "Arena Ladder", desc: "Fight AI copies of real players — balanced auto-battle earns tokens win or lose", color: "border-yellow-500/30 bg-yellow-500/5" },
              ].map((f) => (
                <div key={f.title} className={`border rounded-xl p-4 ${f.color}`}>
                  <div className="text-2xl mb-2">{f.icon}</div>
                  <div className="text-white font-bold text-sm mb-1">{f.title}</div>
                  <div className="text-white/40 text-xs leading-relaxed">{f.desc}</div>
                </div>
              ))}
            </div>

            {/* Rarity pills */}
            <div className="flex flex-wrap justify-center gap-2 text-xs">
              {[
                { label: "Common 60%",     color: "text-gray-400   border-gray-600/40  bg-gray-800/40"  },
                { label: "Rare 25%",       color: "text-blue-400   border-blue-600/40  bg-blue-900/30"  },
                { label: "Epic 10%",       color: "text-purple-400 border-purple-600/40 bg-purple-900/30" },
                { label: "Legendary 4.9%", color: "text-yellow-400 border-yellow-600/40 bg-yellow-900/30" },
                { label: "🌈 Mythic 0.1%",  color: "text-pink-400   border-pink-600/40  bg-pink-900/30"  },
              ].map((r) => (
                <span key={r.label} className={`border rounded-full px-3 py-1 font-bold ${r.color}`}>{r.label}</span>
              ))}
            </div>

            {/* CTA */}
            <div className="space-y-3">
              <WalletButton />
              <div>
                <a href={PUMP_FUN_URL} target="_blank" rel="noopener noreferrer"
                  className="text-emerald-500/70 text-sm hover:text-emerald-400 transition-colors">
                  Hold ${tokenSymbol} to unlock gacha pulls → Pump.fun
                </a>
              </div>
            </div>
          </div>
        </main>
      ) : (
        /* ── Game UI ───────────────────────────────────────────────── */
        <main className="flex-1 flex flex-col max-w-5xl mx-auto w-full px-4 sm:px-6 py-4 gap-4">

          {/* Tab bar */}
          <nav className="flex gap-1 p-1 bg-black/40 border border-white/8 rounded-xl backdrop-blur-sm shrink-0">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-black tracking-wide transition-all duration-200 ${
                  activeTab === tab.id
                    ? `${tab.color} border ${tab.glow}`
                    : "text-white/30 hover:text-white/60 border border-transparent"
                }`}
              >
                <span className="text-sm">{tab.icon}</span>
                <span className="hidden sm:inline uppercase tracking-wider">{tab.label}</span>
              </button>
            ))}
          </nav>

          {/* Tab panel */}
          <div className={`flex-1 min-h-0 border rounded-2xl overflow-hidden ${activeTabMeta.glow}`}>
            <div className="h-full overflow-y-auto p-4 sm:p-5 space-y-4">

              {activeTab === "battle" && (
                <BattleSection
                  onPlayerDataUpdate={handlePlayerDataUpdate}
                  tokenSymbol={tokenSymbol}
                />
              )}

              {activeTab === "gacha" && (
                <GachaMachine
                  tokenBalance={tokenBalance}
                  realTokenBalance={realTokenBalance}
                  tokenSymbol={tokenSymbol}
                  onPullComplete={handlePlayerDataUpdate}
                  totalPulls={totalPulls}
                  lastDailySummonDate={lastDailySummonDate}
                />
              )}

              {activeTab === "fighters" && (
                <FighterCollection fighters={playerData?.fighters ?? []} />
              )}

              {activeTab === "arena" && publicKey && (
                <ArenaLadder
                  wallet={publicKey.toString()}
                  arenaRating={arenaRating}
                  onFightComplete={handlePlayerDataUpdate}
                />
              )}

            </div>
          </div>

        </main>
      )}

      {/* ── Footer ──────────────────────────────────────────────────── */}
      <footer className="shrink-0 text-center py-3 text-white/15 text-xs border-t border-white/5">
        ⚡ Solana Mainnet ·{" "}
        <a href={PUMP_FUN_URL} target="_blank" rel="noopener noreferrer" className="text-emerald-600/50 hover:text-emerald-500 transition-colors">
          ${tokenSymbol}
        </a>
      </footer>
    </div>
  );
}
