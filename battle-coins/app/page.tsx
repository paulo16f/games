"use client";
import { useState, useCallback } from "react";
import WalletButton from "@/components/WalletButton";
import BattleSection from "@/components/BattleSection";
import GachaMachine from "@/components/GachaMachine";
import EquipmentSlots from "@/components/EquipmentSlots";
import { useWallet } from "@solana/wallet-adapter-react";
import { PlayerState } from "@/lib/store";

export default function Home() {
  const { publicKey } = useWallet();
  const [playerData, setPlayerData] = useState<PlayerState | null>(null);

  const handlePlayerDataUpdate = useCallback((data: PlayerState) => {
    setPlayerData(data);
  }, []);

  const tokenBalance = playerData?.tokens ?? 0;
  const totalPulls = playerData?.totalPulls ?? 0;

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
        <div className="flex items-center gap-3">
          {publicKey && (
            <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-4 py-2">
              <span className="text-yellow-400 text-lg">🪙</span>
              <span className="text-white font-bold text-lg">{tokenBalance}</span>
              <span className="text-gray-400 text-sm">BC</span>
            </div>
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
            <WalletButton />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Equipment row — always visible once connected */}
            <EquipmentSlots
              weapon={playerData?.weapon ?? null}
              armor={playerData?.armor ?? null}
              atk={playerData?.atk ?? 8}
              def={playerData?.def ?? 0}
            />

            {/* Battle + Gacha panels */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
                <h2 className="text-white font-black text-xl flex items-center gap-2">⚔️ Battle</h2>
                <BattleSection onPlayerDataUpdate={handlePlayerDataUpdate} />
              </div>

              <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                <GachaMachine
                  tokenBalance={tokenBalance}
                  onPullComplete={handlePlayerDataUpdate}
                  totalPulls={totalPulls}
                />
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="text-center py-4 text-white/20 text-xs">
        ⚡ Running on Solana Devnet
      </footer>
    </div>
  );
}
