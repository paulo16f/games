"use client";
import { useState, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Equipment, PlayerState } from "@/lib/store";
import { GACHA_TIERS, SELL_VALUES, SLOT_META } from "@/lib/constants";

interface Props {
  inventory: Equipment[];
  onPlayerDataUpdate: (data: PlayerState) => void;
}

function statLine(item: Equipment): string {
  if (item.atk > 0 && item.def > 0) return `+${item.atk} ATK / +${item.def} DEF`;
  if (item.atk > 0) return `+${item.atk} ATK`;
  return `+${item.def} DEF`;
}

function InventoryCard({
  item,
  onEquip,
  onSell,
  busy,
}: {
  item: Equipment;
  onEquip: (id: string) => void;
  onSell: (id: string) => void;
  busy: boolean;
}) {
  const tier = GACHA_TIERS.find((t) => t.id === item.tierId);
  const sellValue = SELL_VALUES[item.tierId] ?? 0;

  return (
    <div
      className={`rounded-xl border ${tier?.borderClass ?? "border-white/15"} bg-white/5 p-2 flex flex-col items-center gap-1.5`}
    >
      <div className="text-2xl leading-none">{item.emoji}</div>
      <div className={`text-xs font-semibold text-center leading-tight ${tier?.textClass ?? "text-white"}`}>
        {item.name}
      </div>
      <div className="text-xs text-white/40">{statLine(item)}</div>
      <div className="text-xs text-white/30 bg-white/5 rounded px-1.5 py-0.5">
        {SLOT_META[item.slot].label}
      </div>
      <div className="flex gap-1 w-full mt-0.5">
        <button
          onClick={() => onEquip(item.id)}
          disabled={busy}
          className="flex-1 py-1 rounded-lg text-xs font-bold bg-violet-700/60 hover:bg-violet-700 disabled:opacity-40 text-white transition-all"
        >
          {busy ? "…" : "Equip"}
        </button>
        <button
          onClick={() => onSell(item.id)}
          disabled={busy}
          className="flex-1 py-1 rounded-lg text-xs font-bold bg-yellow-700/40 hover:bg-yellow-700/70 disabled:opacity-40 text-yellow-300 transition-all"
        >
          {busy ? "…" : `+${sellValue}🪙`}
        </button>
      </div>
    </div>
  );
}

export default function Inventory({ inventory, onPlayerDataUpdate }: Props) {
  const { publicKey } = useWallet();
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  const sendAction = useCallback(
    async (action: "equip" | "sell", itemId: string) => {
      if (!publicKey) return;
      setBusyIds((prev) => new Set(prev).add(itemId));
      try {
        const res = await fetch("/api/game/action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, wallet: publicKey.toString(), itemId }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error ?? "Action failed");
        }
        const data = await res.json() as { playerData: PlayerState };
        onPlayerDataUpdate(data.playerData);
      } catch (e) {
        console.error(e);
      } finally {
        setBusyIds((prev) => {
          const next = new Set(prev);
          next.delete(itemId);
          return next;
        });
      }
    },
    [publicKey, onPlayerDataUpdate]
  );

  if (!inventory.length) {
    return (
      <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
        <div className="text-white/50 text-xs font-semibold uppercase tracking-wider mb-2">🎒 Inventory</div>
        <p className="text-white/25 text-sm text-center py-4">No items yet — pull to earn gear!</p>
      </div>
    );
  }

  const isFull = inventory.length >= 20;

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-white/50 text-xs font-semibold uppercase tracking-wider">
          🎒 Inventory
        </span>
        <span className={`text-xs font-mono ${isFull ? "text-red-400" : "text-white/40"}`}>
          {inventory.length}/20{isFull && " · next pull auto-sells"}
        </span>
      </div>
      <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
        {inventory.map((item) => (
          <InventoryCard
            key={item.id}
            item={item}
            onEquip={(id) => sendAction("equip", id)}
            onSell={(id) => sendAction("sell", id)}
            busy={busyIds.has(item.id)}
          />
        ))}
      </div>
    </div>
  );
}
