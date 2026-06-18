"use client";
import { useState, useCallback, useEffect } from "react";
import WalletButton from "@/components/WalletButton";
import BattleSection from "@/components/BattleSection";
import GachaMachine from "@/components/GachaMachine";
import EquipmentSlots from "@/components/EquipmentSlots";
import Leaderboard from "@/components/Leaderboard";
import Inventory from "@/components/Inventory";
import { useWallet } from "@solana/wallet-adapter-react";
import { PlayerState } from "@/lib/store";
import { PUMP_FUN_URL } from "@/lib/constants";

export default function Home() {
  const { publicKey } = useWallet();
  const [playerData, setPlayerData] = useState<PlayerState | null>(null);
  const [realTokenBalance, setRealTokenBalance] = useState(0);
  const [tokenSymbol, setTokenSymbol] = useState("TOKEN");

  const handlePlayerDataUpdate = useCallback((data: PlayerState) => {
    setPlayerData(data);
  }, []);

  // Fetch real on-chain token balance when wallet connects
  useEffect(() => {
    if (!publicKey) { setRealTokenBalance(0); return; }
    const wallet = publicKey.toString();
    fetch(`/api/token/balance?wallet=${wallet}`)
      .then((r) => r.json())
      .then((d) => {
        setRealTokenBalance(d.balance ?? 0);
        if (d.symbol) setTokenSymbol(d.symbol);
      })
      .catch(() => {});
  }, [publicKey]);

  const tokenBalance = playerData?.tokens ?? 0;
  const totalPulls = playerData?.totalPulls ?? 0;

  const fmtBalance = (n: number) =>
    n >= 1_000_000
      ? `${(n / 1_000_000).toFixed(1)}M`
      : n >= 1_000
      ? `${(n / 1_000).toFixed(1)}K`
      : n.toLocaleString(undefined, { maximumFractionDigits: 2 });

  return (
    <div className="relative min-h-screen z-10">
      {/* Header */}
      <header className="sticky top-0 z-20 flex items-center justify-between px-4 sm:px-6 py-4 border-b border-white/10 backdrop-blur-xl bg-black/30">
        <div className="flex items-center gap-3">
          <span className="text-2xl">⚔️</span>
          <div>
            <h1 className="text-white font-black text-lg leading-none">Battle Coins</h1>
            <p className="text-purple-400 text-xs font-medium">Gacha Edition</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {publicKey && (
            <>
              {/* Real token balance — links to pump.fun */}
              <a
                href={PUMP_FUN_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 bg-green-900/40 border border-green-500/30 rounded-xl px-3 py-2 hover:bg-green-900/60 transition-all"
                title={`${realTokenBalance.toLocaleString()} $${tokenSymbol}`}
              >
                <span className="text-green-400 text-sm">🟢</span>
                <span className="text-green-300 font-bold text-sm">{fmtBalance(realTokenBalance)}</span>
                <span className="text-green-500 text-xs">${tokenSymbol}</span>
              </a>
              {/* In-game BC */}
              <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-xl px-3 py-2">
                <span className="text-yellow-400 text-sm">🪙</span>
                <span className="text-white font-bold text-sm">{tokenBalance}</span>
                <span className="text-gray-400 text-xs">BC</span>
              </div>
            </>
          )}
          <WalletButton />
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {!publicKey ? (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6">
            <div className="text-8xl animate-bounce">⚔️</div>
            <div>
              <h2 className="text-4xl font-black text-white mb-2">Battle Coins Gacha</h2>
              <p className="text-gray-400 max-w-md mx-auto">
                Fight enemies using Strike, Heavy, or Dodge. Spend tokens on gacha pulls
                to win weapons and armor — including the legendary 0.1% Ultra!
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-3 text-sm">
              {["⚪ Common 60%", "🔵 Rare 25%", "💜 Super Rare 10%", "⭐ Legendary 4.9%", "🌈 Ultra 0.1%"].map(
                (t) => (
                  <span key={t} className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-gray-300">
                    {t}
                  </span>
                )
              )}
            </div>
            <div className="flex flex-col items-center gap-3">
              <WalletButton />
              <a
                href={PUMP_FUN_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-green-400 text-sm hover:underline"
              >
                🟢 Get ${tokenSymbol} on Pump.fun to unlock gacha pulls →
              </a>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Equipment row */}
            <EquipmentSlots
              weapon={playerData?.weapon ?? null}
              helmet={playerData?.helmet ?? null}
              chest={playerData?.chest   ?? null}
              gloves={playerData?.gloves ?? null}
              boots={playerData?.boots   ?? null}
              ring={playerData?.ring     ?? null}
              atk={playerData?.atk ?? 8}
              def={playerData?.def ?? 0}
            />

            {/* Battle + Gacha panels */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
                <h2 className="text-white font-black text-xl flex items-center gap-2">⚔️ Battle</h2>
                <BattleSection
                  onPlayerDataUpdate={handlePlayerDataUpdate}
                  tokenSymbol={tokenSymbol}
                />
              </div>

              <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                <GachaMachine
                  tokenBalance={tokenBalance}
                  realTokenBalance={realTokenBalance}
                  tokenSymbol={tokenSymbol}
                  onPullComplete={handlePlayerDataUpdate}
                  totalPulls={totalPulls}
                />
              </div>
            </div>

            {/* Inventory */}
            <Inventory
              inventory={playerData?.inventory ?? []}
              onPlayerDataUpdate={handlePlayerDataUpdate}
            />

            {/* Leaderboard */}
            <Leaderboard />
          </div>
        )}
      </main>

      <footer className="text-center py-4 text-white/20 text-xs">
        ⚡ Running on Solana Mainnet · Powered by{" "}
        <a href={PUMP_FUN_URL} target="_blank" rel="noopener noreferrer" className="text-green-500/50 hover:text-green-400 transition-colors">
          ${tokenSymbol}
        </a>
      </footer>
    </div>
  );
}
