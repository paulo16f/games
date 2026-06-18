"use client";
import { useEffect, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { PlayerState } from "@/lib/store";

interface Props {
  onBalanceChange?: (balance: number) => void;
  refreshTrigger?: number;
}

export default function TokenBalance({ onBalanceChange, refreshTrigger }: Props) {
  const { publicKey } = useWallet();

  const fetchBalance = useCallback(async () => {
    if (!publicKey) { onBalanceChange?.(0); return; }
    try {
      const res = await fetch(`/api/game/state?wallet=${publicKey.toString()}`);
      const state: PlayerState = await res.json();
      onBalanceChange?.(state.tokens);
    } catch {
      onBalanceChange?.(0);
    }
  }, [publicKey, onBalanceChange]);

  useEffect(() => { fetchBalance(); }, [fetchBalance, refreshTrigger]);

  return null; // balance is surfaced via onBalanceChange to the parent
}
