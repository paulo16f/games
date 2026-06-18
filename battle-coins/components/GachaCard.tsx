"use client";
import { GachaTier } from "@/lib/constants";

interface Props {
  tier: GachaTier;
  isFlipping?: boolean;
  isRevealed?: boolean;
}

export default function GachaCard({ tier, isFlipping = false, isRevealed = false }: Props) {
  const isUltra = tier.id === 5;

  return (
    <div
      className={`
        relative w-48 h-64 rounded-2xl border-2
        ${tier.borderClass}
        ${isUltra ? "gacha-ultra" : ""}
        overflow-hidden
        transition-all duration-500
        ${isFlipping ? "gacha-flip" : ""}
        ${isRevealed ? "gacha-revealed" : ""}
      `}
      style={{
        background: `linear-gradient(135deg, var(--tw-gradient-from), var(--tw-gradient-to))`,
        boxShadow: isRevealed
          ? `0 0 40px ${tier.glow}, 0 0 80px ${tier.glow}40`
          : "none",
      }}
    >
      {/* Background gradient */}
      <div className={`absolute inset-0 bg-gradient-to-br ${tier.bgClass} opacity-90`} />

      {/* Shimmer overlay for SR+ */}
      {tier.id >= 3 && isRevealed && (
        <div className="absolute inset-0 gacha-shimmer" />
      )}

      {/* Ultra rainbow effect */}
      {isUltra && isRevealed && (
        <div className="absolute inset-0 gacha-rainbow opacity-40" />
      )}

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center justify-center h-full gap-3 p-4">
        <div className={`text-5xl ${isUltra && isRevealed ? "animate-bounce" : ""}`}>
          {tier.emoji}
        </div>

        <div className="text-center space-y-1">
          <div className={`font-black text-xl tracking-wider ${tier.textClass} ${isUltra ? "gacha-ultra-text" : ""}`}>
            {tier.name.toUpperCase()}
          </div>

          {isRevealed && (
            <div className="text-white/80 text-sm font-medium">
              {tier.rewardTokens === 0 ? (
                <span className="text-gray-400">No reward</span>
              ) : (
                <span>
                  <span className={`font-bold text-lg ${tier.textClass}`}>
                    +{tier.rewardTokens}
                  </span>{" "}
                  🪙 BC
                </span>
              )}
            </div>
          )}

          <div className="text-white/40 text-xs">
            {tier.probability}% chance
          </div>
        </div>
      </div>

      {/* Corner rarity badge */}
      {isRevealed && tier.id >= 4 && (
        <div
          className="absolute top-2 right-2 text-xs font-bold px-2 py-0.5 rounded-full"
          style={{
            background: tier.color,
            color: "white",
          }}
        >
          {tier.id === 5 ? "✦ ULTRA" : "★ LEGEND"}
        </div>
      )}
    </div>
  );
}
