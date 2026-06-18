"use client";
import { Equipment } from "@/lib/store";
import { GACHA_TIERS, SLOT_META, EquipmentSlot } from "@/lib/constants";

interface Props {
  weapon: Equipment | null;
  helmet: Equipment | null;
  chest:  Equipment | null;
  gloves: Equipment | null;
  boots:  Equipment | null;
  ring:   Equipment | null;
  atk: number;
  def: number;
}

function statLine(item: Equipment): string {
  if (item.atk > 0 && item.def > 0) return `+${item.atk} ATK / +${item.def} DEF`;
  if (item.atk > 0) return `+${item.atk} ATK`;
  return `+${item.def} DEF`;
}

function SlotCard({ slot, item }: { slot: EquipmentSlot; item: Equipment | null }) {
  const meta = SLOT_META[slot];
  const tier = item ? GACHA_TIERS.find((t) => t.id === item.tierId) : null;

  return (
    <div
      className={`rounded-xl border p-2 flex flex-col items-center gap-1 min-h-[88px] ${
        tier
          ? `${tier.borderClass} bg-white/5`
          : "border-dashed border-white/15 bg-white/[0.02]"
      }`}
    >
      <div className="text-xs text-white/40 font-medium uppercase tracking-wider leading-none">
        {meta.label}
      </div>
      {item ? (
        <>
          <div className="text-xl leading-none">{item.emoji}</div>
          <div className={`text-xs font-semibold text-center leading-tight ${tier?.textClass ?? "text-white"}`}>
            {item.name}
          </div>
          <div className="text-xs text-white/40">{statLine(item)}</div>
        </>
      ) : (
        <div className="text-2xl text-white/15 mt-0.5">{meta.placeholder}</div>
      )}
    </div>
  );
}

const SLOT_ROWS: [EquipmentSlot, EquipmentSlot, EquipmentSlot][] = [
  ["weapon", "helmet", "chest"],
  ["gloves", "boots",  "ring"],
];

export default function EquipmentSlots({ weapon, helmet, chest, gloves, boots, ring, atk, def }: Props) {
  const slotMap: Record<EquipmentSlot, Equipment | null> = {
    weapon, helmet, chest, gloves, boots, ring,
  };

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-white/60 text-xs font-semibold uppercase tracking-wider">Equipment</span>
        <div className="flex gap-3 text-sm">
          <span className="text-orange-400 font-bold">⚔️ {atk} ATK</span>
          <span className="text-blue-400 font-bold">🛡️ {def} DEF</span>
        </div>
      </div>
      {SLOT_ROWS.map((row, ri) => (
        <div key={ri} className="grid grid-cols-3 gap-2">
          {row.map((slot) => (
            <SlotCard key={slot} slot={slot} item={slotMap[slot]} />
          ))}
        </div>
      ))}
    </div>
  );
}
