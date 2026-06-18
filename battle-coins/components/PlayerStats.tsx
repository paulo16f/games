"use client";

interface Props {
  health: number;
  totalKills: number;
  totalPulls: number;
  maxHealth?: number;
  atk?: number;
  def?: number;
}

export default function PlayerStats({
  health,
  totalKills,
  totalPulls,
  maxHealth = 100,
  atk = 8,
  def = 0,
}: Props) {
  const hpPct = Math.max(0, Math.min(100, (health / maxHealth) * 100));
  const hpColor =
    hpPct > 60 ? "bg-green-500" :
    hpPct > 30 ? "bg-yellow-500" :
    "bg-red-500";

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
      <h3 className="text-white/70 text-xs font-semibold uppercase tracking-wider">Player Stats</h3>

      <div className="space-y-1">
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">HP</span>
          <span className="text-white font-mono">{health}/{maxHealth}</span>
        </div>
        <div className="h-3 bg-white/10 rounded-full overflow-hidden">
          <div
            className={`h-full ${hpColor} rounded-full transition-all duration-500`}
            style={{ width: `${hpPct}%` }}
          />
        </div>
      </div>

      <div className="flex gap-3 text-sm flex-wrap">
        <div className="text-center flex-1">
          <div className="text-white font-bold text-lg">{totalKills}</div>
          <div className="text-gray-500 text-xs">Kills</div>
        </div>
        <div className="w-px bg-white/10" />
        <div className="text-center flex-1">
          <div className="text-white font-bold text-lg">{totalPulls}</div>
          <div className="text-gray-500 text-xs">Pulls</div>
        </div>
        <div className="w-px bg-white/10" />
        <div className="text-center flex-1">
          <div className="text-orange-400 font-bold text-lg">{atk}</div>
          <div className="text-gray-500 text-xs">⚔️ ATK</div>
        </div>
        <div className="w-px bg-white/10" />
        <div className="text-center flex-1">
          <div className="text-blue-400 font-bold text-lg">{def}</div>
          <div className="text-gray-500 text-xs">🛡️ DEF</div>
        </div>
      </div>
    </div>
  );
}
