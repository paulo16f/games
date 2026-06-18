"use client";
import { Equipment } from "@/lib/store";
import { GACHA_TIERS } from "@/lib/constants";

interface SlotProps {
  label: string;
  item: Equipment | null;
  placeholder: string;
}

function SlotCard({ label, item, placeholder }: SlotProps) {
  const tier = item ? GACHA_TIERS.find((t) => t.id === item.tierId) : null;

  if (!item) {
    return (
      <div className="flex-1 rounded-xl border-2 border-dashed border-white/15 flex flex-col items-center justify-center gap-1.5 p-3 min-h-[5.5rem] text-white/25">
        <span className="text-2xl">{placeholder}</span>
        <span className="text-xs">{label}</span>
      </div>
    );
  }

  return (
    <div
      className={`flex-1 rounded-xl border-2 ${tier?.borderClass ?? "border-white/30"} bg-white/5 flex flex-col items-center gap-1 p-3`}
    >
      <span className="text-2xl">{item.emoji}</span>
      <span className={`text-xs font-bold text-center leading-tight ${tier?.textClass ?? "text-white"}`}>
        {item.name}
      </span>
      <span className="text-white/60 text-xs font-mono">
        {item.atk > 0 ? `+${item.atk} ATK` : `+${item.def} DEF`}
      </span>
    </div>
  );
}

interface Props {
  weapon: Equipment | null;
  armor: Equipment | null;
  atk: number;
  def: number;
}

export default function EquipmentSlots({ weapon, armor, atk, def }: Props) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-white/70 text-xs font-semibold uppercase tracking-wider">Equipment</h3>
        <div className="flex gap-3 text-xs font-mono">
          <span className="text-orange-400">⚔️ {atk} ATK</span>
          <span className="text-blue-400">🛡️ {def} DEF</span>
        </div>
      </div>
      <div className="flex gap-3">
        <SlotCard label="Weapon" item={weapon} placeholder="🗡️" />
        <SlotCard label="Armor" item={armor} placeholder="🧥" />
      </div>
    </div>
  );
}
