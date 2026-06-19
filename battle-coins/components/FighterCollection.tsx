"use client";
import { Fighter } from "@/lib/store";
import { GACHA_TIERS, STAR_MULTIPLIERS, ELEMENT_META } from "@/lib/constants";

interface Props {
  fighters: Fighter[];
}

function effectivePower(f: Fighter): number {
  return Math.round(f.basePower * STAR_MULTIPLIERS[Math.min(f.stars - 1, 4)]);
}

function stars(n: number): string {
  return "★".repeat(n) + "☆".repeat(5 - n);
}

export default function FighterCollection({ fighters }: Props) {
  if (!fighters.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
        <div className="text-5xl opacity-30">🧿</div>
        <div className="text-white/30 text-sm">No fighters yet</div>
        <div className="text-white/20 text-xs">Pull from the Gacha or use your daily summon</div>
      </div>
    );
  }

  const sorted = [...fighters].sort((a, b) => effectivePower(b) - effectivePower(a));
  const best = sorted[0];

  return (
    <div className="space-y-4">

      {/* Battle leader card */}
      <div className="bg-white/5 border border-yellow-500/20 rounded-2xl p-4">
        <div className="text-white/40 text-xs font-semibold uppercase tracking-wider mb-3">⚡ Battle Leader</div>
        <div className="flex items-center gap-4">
          <div className="text-5xl">{best.emoji}</div>
          <div className="flex-1 min-w-0">
            <div className={`text-lg font-black ${GACHA_TIERS.find(t => t.id === best.tierId)?.textClass ?? "text-white"}`}>
              {best.name}
            </div>
            <div className="text-yellow-400 text-sm tracking-widest">{stars(best.stars)}</div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-white/40 text-xs">{ELEMENT_META[best.element as keyof typeof ELEMENT_META]?.emoji ?? "⚔️"} {ELEMENT_META[best.element as keyof typeof ELEMENT_META]?.label ?? best.element}</span>
              <span className="text-white/20 text-xs">·</span>
              <span className="text-white/70 text-sm font-mono">⚡ {effectivePower(best).toLocaleString()}</span>
            </div>
          </div>
          <div className="text-right">
            <div className={`text-xs font-bold uppercase ${GACHA_TIERS.find(t => t.id === best.tierId)?.textClass ?? "text-white"}`}>
              {GACHA_TIERS.find(t => t.id === best.tierId)?.name ?? "Unknown"}
            </div>
            <div className="text-white/30 text-xs mt-0.5">{fighters.length} total</div>
          </div>
        </div>
      </div>

      {/* Fighter grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {sorted.map(f => {
          const tier = GACHA_TIERS.find(t => t.id === f.tierId);
          const element = ELEMENT_META[f.element as keyof typeof ELEMENT_META];
          const power = effectivePower(f);
          const isMax = f.stars === 5;
          return (
            <div
              key={f.id}
              className={`relative rounded-xl border p-3 bg-white/3 flex flex-col gap-2 ${tier?.borderClass ?? "border-white/10"}`}
              style={isMax ? { boxShadow: `0 0 12px ${tier?.glow ?? "rgba(255,255,255,0.1)"}` } : undefined}
            >
              {isMax && (
                <div className="absolute top-2 right-2 text-[10px] font-black text-yellow-400 bg-yellow-400/10 border border-yellow-400/30 rounded px-1">MAX</div>
              )}
              <div className="text-3xl text-center">{f.emoji}</div>
              <div className={`text-sm font-bold text-center leading-tight ${tier?.textClass ?? "text-white"}`}>
                {f.name}
              </div>
              <div className="text-yellow-400 text-xs tracking-widest text-center">{stars(f.stars)}</div>
              <div className="flex items-center justify-between text-xs mt-auto">
                <span className="text-white/35">{element?.emoji ?? "⚔️"} {element?.label ?? f.element}</span>
                <span className="text-white/60 font-mono">⚡{power >= 1000 ? `${(power / 1000).toFixed(1)}k` : power}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Power range summary */}
      <div className="text-center text-white/20 text-xs">
        {fighters.length} fighter{fighters.length > 1 ? "s" : ""} ·{" "}
        ⚡{effectivePower(sorted[sorted.length - 1]).toLocaleString()} – {effectivePower(sorted[0]).toLocaleString()} power range
      </div>
    </div>
  );
}
