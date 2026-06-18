"use client";
import { useState, useCallback, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { ENEMIES, PUMP_FUN_URL } from "@/lib/constants";
import { PlayerState } from "@/lib/store";
import PlayerStats from "./PlayerStats";

interface ShareState {
  bossNumber: number;
  totalKills: number;
  tweetUrl: string;
}

function buildBossTweet(bossNumber: number, totalKills: number, tokenSymbol: string): string {
  const text = `👑 Defeated Boss #${bossNumber} on Battle Coins Gacha! ${totalKills} total kills — hold $${tokenSymbol} to play 💀 #pumpfun #solana`;
  const url = typeof window !== "undefined" ? window.location.origin : "";
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
}

interface Props {
  onPlayerDataUpdate: (data: PlayerState) => void;
  tokenSymbol?: string;
}

function randomEnemy() {
  return ENEMIES[Math.floor(Math.random() * ENEMIES.length)];
}

export default function BattleSection({ onPlayerDataUpdate, tokenSymbol = "TOKEN" }: Props) {
  const { publicKey } = useWallet();

  const [enemy, setEnemy] = useState(randomEnemy);
  const [enemyHp, setEnemyHp] = useState(() => enemy.baseHp);
  const [enemyMaxHp, setEnemyMaxHp] = useState(() => enemy.baseHp);
  const [isBoss, setIsBoss] = useState(false);

  const [playerData, setPlayerData] = useState<PlayerState | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [busy, setBusy] = useState(false);
  const [combatLog, setCombatLog] = useState<string[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [enemyAnimating, setEnemyAnimating] = useState(false);
  const [bossShare, setBossShare] = useState<ShareState | null>(null);

  const addLog = (msg: string) =>
    setCombatLog((prev) => [msg, ...prev].slice(0, 4));

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const fetchPlayerData = useCallback(async () => {
    if (!publicKey) return;
    try {
      const res = await fetch(`/api/game/state?wallet=${publicKey.toString()}`);
      const state: PlayerState = await res.json();
      const isNew =
        state.tokens === 0 &&
        state.totalKills === 0 &&
        state.totalPulls === 0 &&
        !state.weapon &&
        !state.armor;
      setInitialized(!isNew);
      setPlayerData(state);
      onPlayerDataUpdate(state);
    } catch { /* ignore */ }
  }, [publicKey, onPlayerDataUpdate]);

  useEffect(() => { fetchPlayerData(); }, [fetchPlayerData]);

  const sendAction = useCallback(
    async (action: string, extra: Record<string, unknown> = {}) => {
      if (!publicKey) return null;
      const res = await fetch("/api/game/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, wallet: publicKey.toString(), ...extra }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Action failed");
      }
      return res.json() as Promise<{ playerData: PlayerState; result: Record<string, unknown> }>;
    },
    [publicKey]
  );

  const spawnNext = useCallback((newKills: number) => {
    const nextIsBoss = newKills > 0 && newKills % 5 === 0;
    const next = randomEnemy();
    const hp = nextIsBoss ? next.baseHp * 3 : next.baseHp;
    setEnemy(next);
    setEnemyHp(hp);
    setEnemyMaxHp(hp);
    setIsBoss(nextIsBoss);
    if (nextIsBoss) showToast("👑 BOSS INCOMING!");
  }, []);

  const initPlayer = useCallback(async () => {
    setBusy(true);
    try {
      const data = await sendAction("init");
      if (data) {
        setPlayerData(data.playerData);
        setInitialized(true);
        onPlayerDataUpdate(data.playerData);
        showToast("Adventure started! ⚔️");
      }
    } catch (e) {
      showToast(String(e));
    } finally {
      setBusy(false);
    }
  }, [sendAction, onPlayerDataUpdate]);

  const attack = useCallback(
    async (move: "strike" | "heavy" | "dodge") => {
      if (!publicKey || !playerData || playerData.health === 0 || busy) return;
      setBusy(true);
      try {
        const data = await sendAction(move);
        if (!data) return;

        const { playerDamage, enemyDamage } = data.result as {
          playerDamage: number;
          enemyDamage: number;
        };

        setPlayerData(data.playerData);
        onPlayerDataUpdate(data.playerData);

        const moveLabel =
          move === "strike" ? "⚔️ Strike" :
          move === "heavy"  ? "💥 Heavy"  : "🛡️ Dodge";

        addLog(
          enemyDamage === 0
            ? `${moveLabel}: ${playerDamage} dmg, no counter!`
            : `${moveLabel}: ${playerDamage} dmg dealt, ${enemyDamage} received`
        );

        setEnemyAnimating(true);
        setTimeout(() => setEnemyAnimating(false), 500);

        const newEnemyHp = enemyHp - playerDamage;
        setEnemyHp(Math.max(0, newEnemyHp));

        if (newEnemyHp <= 0) {
          const killData = await sendAction("kill", { isBoss });
          if (killData) {
            setPlayerData(killData.playerData);
            onPlayerDataUpdate(killData.playerData);
            const earned = killData.result.tokensEarned as number;
            addLog(`${isBoss ? "👑 Boss" : "Enemy"} slain! +${earned} 🪙`);
            if (isBoss) {
              const kills = killData.playerData.totalKills;
              const bossNum = Math.floor(kills / 5);
              setBossShare({
                bossNumber: bossNum,
                totalKills: kills,
                tweetUrl: buildBossTweet(bossNum, kills, tokenSymbol),
              });
              setTimeout(() => setBossShare(null), 10_000);
            }
            spawnNext(killData.playerData.totalKills);
          }
        }
      } catch (e) {
        showToast(String(e));
      } finally {
        setBusy(false);
      }
    },
    [publicKey, playerData, busy, sendAction, onPlayerDataUpdate, enemyHp, isBoss, spawnNext]
  );

  const heal = useCallback(async () => {
    if (!publicKey || !playerData || playerData.tokens < 1 || busy) return;
    setBusy(true);
    try {
      const data = await sendAction("heal");
      if (data) {
        setPlayerData(data.playerData);
        onPlayerDataUpdate(data.playerData);
        addLog("💚 Healed to full! (−1 🪙)");
        showToast("Healed! 💚");
      }
    } catch (e) {
      showToast(String(e));
    } finally {
      setBusy(false);
    }
  }, [publicKey, playerData, busy, sendAction, onPlayerDataUpdate]);

  if (!publicKey) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-gray-500">
        <p>Connect wallet to play</p>
      </div>
    );
  }

  const enemyHpPct = Math.max(0, (enemyHp / enemyMaxHp) * 100);
  const isDead = playerData?.health === 0;
  const canAttack = !busy && !isDead && initialized;

  return (
    <div className="relative space-y-4">
      {toast && (
        <div className="absolute -top-2 left-1/2 -translate-x-1/2 z-50 bg-black/80 border border-white/20 text-white px-4 py-2 rounded-xl text-sm animate-fade-in-down whitespace-nowrap pointer-events-none">
          {toast}
        </div>
      )}

      {/* Enemy card */}
      <div className={`bg-white/5 border ${isBoss ? "border-yellow-500/60 shadow-[0_0_16px_rgba(234,179,8,0.2)]" : "border-white/10"} rounded-2xl p-4 text-center relative overflow-hidden`}>
        {isBoss && (
          <div className="absolute top-2 right-2 text-xs font-bold text-yellow-400 bg-yellow-500/20 px-2 py-0.5 rounded-full border border-yellow-500/40">
            👑 BOSS
          </div>
        )}
        <div className={`text-6xl mb-2 transition-transform ${enemyAnimating ? "scale-125" : "scale-100"} duration-150`}>
          {enemy.emoji}
        </div>
        <div className="text-white font-bold">
          {isBoss ? `⚔️ ${enemy.name} (Boss)` : enemy.name}
        </div>
        <div className="mt-2 space-y-1">
          <div className="flex justify-between text-xs text-gray-400">
            <span>Enemy HP</span>
            <span>{Math.max(0, enemyHp)}/{enemyMaxHp}</span>
          </div>
          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
            <div
              className={`h-full ${isBoss ? "bg-yellow-500" : "bg-red-500"} rounded-full transition-all duration-500`}
              style={{ width: `${enemyHpPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Player Stats */}
      {playerData && initialized && (
        <PlayerStats
          health={playerData.health}
          totalKills={playerData.totalKills}
          totalPulls={playerData.totalPulls}
          atk={playerData.atk}
          def={playerData.def}
        />
      )}

      {/* Actions */}
      {!initialized ? (
        <button
          onClick={initPlayer}
          disabled={busy}
          className="w-full py-3 rounded-xl font-bold text-white bg-gradient-to-r from-violet-600 to-blue-600 hover:opacity-90 disabled:opacity-50 transition-all"
        >
          {busy ? "Starting…" : "⚔️ Start Adventure"}
        </button>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { move: "strike", emoji: "⚔️", label: "Strike",  sub: "Balanced",      bg: "from-red-700 to-red-900"       },
                { move: "heavy",  emoji: "💥", label: "Heavy",   sub: "High risk/dmg", bg: "from-orange-700 to-orange-900" },
                { move: "dodge",  emoji: "🛡️", label: "Dodge",   sub: "No dmg taken",  bg: "from-blue-700 to-blue-900"     },
              ] as const
            ).map(({ move, emoji, label, sub, bg }) => (
              <button
                key={move}
                onClick={() => attack(move)}
                disabled={!canAttack}
                className={`py-3 rounded-xl font-bold text-white bg-gradient-to-b ${bg} hover:brightness-110 disabled:opacity-40 transition-all flex flex-col items-center gap-0.5`}
              >
                <span className="text-xl">{busy ? "⏳" : emoji}</span>
                <span className="text-sm">{label}</span>
                <span className="text-xs text-white/50 font-normal">{sub}</span>
              </button>
            ))}
          </div>

          <button
            onClick={heal}
            disabled={busy || !playerData || playerData.health >= 100 || playerData.tokens < 1}
            className="w-full py-2.5 rounded-xl font-bold text-white bg-gradient-to-r from-green-700 to-emerald-700 hover:opacity-90 disabled:opacity-30 transition-all text-sm"
          >
            💚 Heal to full (costs 1 🪙)
          </button>
        </>
      )}

      {isDead && (
        <p className="text-center text-red-400 text-sm animate-pulse">
          ☠️ You&apos;re dead — heal to continue!
        </p>
      )}

      {combatLog.length > 0 && (
        <div className="bg-black/30 border border-white/10 rounded-xl p-3">
          <div className="text-white/40 text-xs uppercase tracking-wider mb-2">Combat Log</div>
          <div className="space-y-1">
            {combatLog.map((line, i) => (
              <div key={i} className={`text-xs ${i === 0 ? "text-white/80" : "text-white/35"}`}>
                {line}
              </div>
            ))}
          </div>
        </div>
      )}

      {bossShare && (
        <div className="flex flex-col items-center gap-2 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl animate-fade-in-down">
          <div className="text-yellow-300 font-bold text-sm">
            👑 Boss #{bossShare.bossNumber} defeated! {bossShare.totalKills} kills total
          </div>
          <div className="flex gap-2">
            <a
              href={bossShare.tweetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1DA1F2]/20 border border-[#1DA1F2]/40 text-[#1DA1F2] text-xs font-bold hover:bg-[#1DA1F2]/30 transition-all"
            >
              𝕏 Flex on X
            </a>
            <a
              href={PUMP_FUN_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 text-xs font-bold hover:bg-green-500/20 transition-all"
            >
              🟢 Pump.fun
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
