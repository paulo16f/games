"use client";
import { useEffect, useState } from "react";
import { Equipment } from "@/lib/store";

interface Entry {
  wallet: string;
  totalKills: number;
  totalPulls: number;
  weapon: Equipment | null;
  armor: Equipment | null;
}

const MEDALS = ["🥇", "🥈", "🥉"];

function shortWallet(w: string) {
  return `${w.slice(0, 4)}…${w.slice(-4)}`;
}

export default function Leaderboard() {
  const [entries, setEntries] = useState<Entry[]>([]);

  const refresh = () =>
    fetch("/api/leaderboard")
      .then((r) => r.json())
      .then(setEntries)
      .catch(() => {});

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, []);

  if (!entries.length) return null;

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
      <h3 className="text-white/70 text-xs font-semibold uppercase tracking-wider mb-3">
        🏆 Leaderboard
      </h3>
      <div className="space-y-2">
        {entries.map((e, i) => (
          <div key={e.wallet} className="flex items-center gap-3">
            <span className="w-6 text-center text-sm">
              {MEDALS[i] ?? <span className="text-white/30 font-mono text-xs">{i + 1}</span>}
            </span>
            <span className="text-white/60 font-mono text-xs flex-1">{shortWallet(e.wallet)}</span>
            <span className="text-white font-bold text-sm">{e.totalKills} kills</span>
            <span className="flex gap-1 text-base">
              {e.weapon && <span title={e.weapon.name}>{e.weapon.emoji}</span>}
              {e.armor && <span title={e.armor.name}>{e.armor.emoji}</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
