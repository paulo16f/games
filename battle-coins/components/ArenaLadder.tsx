"use client";
import { useEffect, useState, useCallback } from "react";
import { NPC_OPPONENTS, NpcOpponent, STAR_MULTIPLIERS, GACHA_TIERS } from "@/lib/constants";
import { Fighter, PlayerState } from "@/lib/store";

interface RealEntry {
  wallet: string;
  arenaRating: number;
  topFighter: Fighter | null;
}

type DisplayEntry = {
  wallet: string;
  arenaRating: number;
  fighter: { name: string; emoji: string; tierId: number; stars: number; basePower: number } | null;
  isNpc: boolean;
};

interface BattleResult {
  won: boolean;
  winChance: number;
  playerPower: number;
  opponentPower: number;
  ratingChange: number;
  newRating: number;
  tokensEarned: number;
  playerFighter: Fighter;
}

interface Props {
  wallet: string;
  arenaRating: number;
  onFightComplete: (data: PlayerState) => void;
}

function effectivePower(f: { basePower: number; stars: number }): number {
  return Math.round(f.basePower * STAR_MULTIPLIERS[Math.min(f.stars - 1, 4)]);
}

function stars(n: number): string {
  return "★".repeat(n) + "☆".repeat(5 - n);
}

function shortWallet(w: string): string {
  if (w.startsWith("NPC:")) return w.replace("NPC:", "");
  return `${w.slice(0, 4)}…${w.slice(-4)}`;
}

function tierColor(tierId: number): string {
  return GACHA_TIERS.find(t => t.id === tierId)?.textClass ?? "text-white";
}

const MEDALS = ["🥇", "🥈", "🥉"];

export default function ArenaLadder({ wallet, arenaRating, onFightComplete }: Props) {
  const [entries, setEntries] = useState<DisplayEntry[]>([]);
  const [fighting, setFighting] = useState<string | null>(null);
  const [battleResult, setBattleResult] = useState<BattleResult | null>(null);
  const [playerFighterName, setPlayerFighterName] = useState<string>("");

  const buildEntries = useCallback((real: RealEntry[]) => {
    const realDisplay: DisplayEntry[] = real
      .filter(e => e.wallet !== wallet)
      .map(e => ({
        wallet: e.wallet,
        arenaRating: e.arenaRating,
        fighter: e.topFighter,
        isNpc: false,
      }));

    const npcDisplay: DisplayEntry[] = NPC_OPPONENTS.map(n => ({
      wallet: n.wallet,
      arenaRating: n.arenaRating,
      fighter: n.fighter,
      isNpc: true,
    }));

    const merged = [...realDisplay, ...npcDisplay]
      .sort((a, b) => b.arenaRating - a.arenaRating)
      .slice(0, 10);

    setEntries(merged);
  }, [wallet]);

  const refresh = useCallback(() => {
    fetch("/api/leaderboard")
      .then(r => r.json())
      .then((data: RealEntry[]) => buildEntries(data))
      .catch(() => buildEntries([]));
  }, [buildEntries]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, [refresh]);

  const fight = useCallback(async (opponentWallet: string) => {
    if (fighting) return;
    setFighting(opponentWallet);
    setBattleResult(null);

    await new Promise(r => setTimeout(r, 1400));

    try {
      const res = await fetch("/api/game/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "arena_fight", wallet, opponentWallet }),
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error ?? "Fight failed");
      }
      const data = await res.json() as { playerData: PlayerState; result: BattleResult };
      setBattleResult(data.result);
      setPlayerFighterName(data.result.playerFighter?.name ?? "");
      onFightComplete(data.playerData);
      refresh();
    } catch (e) {
      console.error(e);
    } finally {
      setFighting(null);
    }
  }, [wallet, fighting, onFightComplete, refresh]);

  return (
    <div className="space-y-4">

      {/* Player's own rating */}
      <div className="bg-white/5 border border-yellow-500/20 rounded-2xl p-4 flex items-center justify-between">
        <div className="text-white/60 text-sm font-semibold">Your Rating</div>
        <div className="text-yellow-400 font-black text-2xl">⚡ {arenaRating.toLocaleString()}</div>
      </div>

      {/* Battle result overlay */}
      {battleResult && (
        <div className={`rounded-2xl border p-5 space-y-3 text-center ${battleResult.won
          ? "border-emerald-500/40 bg-emerald-900/20"
          : "border-red-500/30 bg-red-900/15"}`}>
          <div className="text-white/40 text-xs uppercase tracking-widest font-bold">⚔️ Auto Battle Result</div>
          <div className="flex items-center justify-center gap-4 text-sm">
            <div className="text-center">
              <div className="text-2xl">{battleResult.playerFighter?.emoji ?? "⚔️"}</div>
              <div className="text-white/60 text-xs">{playerFighterName}</div>
              <div className="text-white font-mono text-xs">⚡{battleResult.playerPower.toLocaleString()}</div>
            </div>
            <div className="text-white/30 text-xl font-black">VS</div>
            <div className="text-center">
              <div className="text-2xl">
                {entries.find(e => fighting === null && battleResult)?.fighter?.emoji ?? "👹"}
              </div>
              <div className="text-white/60 text-xs">Opponent</div>
              <div className="text-white font-mono text-xs">⚡{battleResult.opponentPower.toLocaleString()}</div>
            </div>
          </div>
          <div className="text-white/40 text-xs">Win chance: {battleResult.winChance}%</div>
          <div className={`text-2xl font-black ${battleResult.won ? "text-emerald-400" : "text-red-400"}`}>
            {battleResult.won ? "VICTORY!" : "DEFEAT"}
          </div>
          <div className="flex items-center justify-center gap-3 text-sm">
            <span className={`font-bold ${battleResult.ratingChange > 0 ? "text-emerald-400" : "text-red-400"}`}>
              {battleResult.ratingChange > 0 ? "+" : ""}{battleResult.ratingChange} rating
            </span>
            <span className="text-white/30">·</span>
            <span className="text-yellow-400 font-bold">+{battleResult.tokensEarned}🪙</span>
            <span className="text-white/30">·</span>
            <span className="text-white/50 text-xs">→ {battleResult.newRating.toLocaleString()}</span>
          </div>
          <button onClick={() => setBattleResult(null)}
            className="text-white/30 text-xs hover:text-white/60 transition-colors">
            Dismiss
          </button>
        </div>
      )}

      {/* Opponent list */}
      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        <div className="px-4 pt-4 pb-2 text-white/40 text-xs font-semibold uppercase tracking-wider">
          🏆 Arena Ladder
        </div>
        <div className="divide-y divide-white/5">
          {entries.map((entry, i) => {
            const isFighting = fighting === entry.wallet;
            const power = entry.fighter ? effectivePower(entry.fighter) : 0;
            return (
              <div key={entry.wallet} className="flex items-center gap-3 px-4 py-3">
                {/* Rank */}
                <span className="w-6 shrink-0 text-center text-sm">
                  {MEDALS[i] ?? <span className="text-white/25 font-mono text-xs">{i + 1}</span>}
                </span>

                {/* Fighter info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{entry.fighter?.emoji ?? "👤"}</span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-sm font-bold truncate ${entry.fighter ? tierColor(entry.fighter.tierId) : "text-white/40"}`}>
                          {entry.fighter?.name ?? "—"}
                        </span>
                        {entry.isNpc && <span className="text-white/25 text-[10px]">NPC</span>}
                      </div>
                      {entry.fighter && (
                        <div className="flex items-center gap-2">
                          <span className="text-yellow-400/70 text-[11px] tracking-wider">{stars(entry.fighter.stars)}</span>
                          <span className="text-white/30 text-[11px]">⚡{power.toLocaleString()}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Rating + fight */}
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-white/60 font-mono text-sm">{entry.arenaRating.toLocaleString()}</span>
                  <button
                    onClick={() => fight(entry.wallet)}
                    disabled={!!fighting}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black tracking-wide transition-all ${
                      isFighting
                        ? "bg-yellow-500/20 text-yellow-400 cursor-not-allowed"
                        : fighting
                          ? "bg-white/5 text-white/20 cursor-not-allowed"
                          : "bg-red-600/25 border border-red-500/40 text-red-300 hover:bg-red-600/40 hover:scale-105 active:scale-95"
                    }`}
                  >
                    {isFighting ? "⚔️ Fighting…" : "FIGHT"}
                  </button>
                </div>
              </div>
            );
          })}
          {entries.length === 0 && (
            <div className="px-4 py-8 text-center text-white/25 text-sm">Loading opponents…</div>
          )}
        </div>
      </div>

      <div className="text-center text-white/20 text-xs">
        Win +15 rating · Lose -10 rating · Both earn tokens
      </div>
    </div>
  );
}
