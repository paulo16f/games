"use client";

interface Props {
  health: number;
  totalKills: number;
  totalPulls: number;
  maxHealth?: number;
  atk?: number;
  def?: number;
  status?: "none" | "burn" | "stun";
  statusDuration?: number;
}

export default function PlayerStats({
  health,
  totalKills,
  totalPulls,
  maxHealth = 100,
  atk = 8,
  def = 0,
  status = "none",
  statusDuration = 0,
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
        <div className="flex justify-between items-center text-sm">
          <span className="text-gray-400">HP</span>
          <div className="flex items-center gap-2">
            {status !== "none" && statusDuration > 0 && (
              <span
                className="animate-status-pulse text-xs font-bold px-2 py-0.5 rounded-full"
                style={status === "burn"
                  ? { background: "rgba(249,115,22,0.2)", color: "#f97316", border: "1px solid rgba(249,115,22,0.5)" }
                  : { background: "rgba(167,139,250,0.2)", color: "#a78bfa", border: "1px solid rgba(167,139,250,0.5)" }
                }
              >
                {status === "burn" ? `🔥 Burn ×${statusDuration}` : `💫 Stun ×${statusDuration}`}
              </span>
            )}
            <span className="text-white font-mono">{health}/{maxHealth}</span>
          </div>
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
