"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { ENEMIES, ELEMENT_META, EnemyElement } from "@/lib/constants";
import { PlayerState } from "@/lib/store";
import PlayerStats from "./PlayerStats";
import { PUMP_FUN_URL } from "@/lib/constants";

interface ShareState { bossNumber: number; totalKills: number; tweetUrl: string; }
interface FloatNum { id: number; text: string; color: string; x: number; size: number; }

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

const COMBO_COLORS = ["", "#facc15", "#f97316", "#ef4444", "#ec4899"];

// Auto-fighter picks the enemy's weakness move, or dodges on telegraph
const WEAKNESS_MAP: Record<string, "strike" | "heavy" | "dodge"> = {
  fire: "heavy", ice: "strike", dark: "dodge", light: "heavy", physical: "strike",
};

export default function BattleSection({ onPlayerDataUpdate, tokenSymbol = "TOKEN" }: Props) {
  const { publicKey } = useWallet();
  const numIdRef = useRef(0);
  const busyRef = useRef(false);     // blocks overlapping attack calls
  const respawningRef = useRef(false); // true during the 500ms enemy death pause

  const [enemy, setEnemy] = useState(randomEnemy);
  const [enemyHp, setEnemyHp] = useState(() => enemy.baseHp);
  const [enemyMaxHp, setEnemyMaxHp] = useState(() => enemy.baseHp);
  const [isBoss, setIsBoss] = useState(false);

  const [playerData, setPlayerData] = useState<PlayerState | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [autoRunning, setAutoRunning] = useState(false);
  const [combatLog, setCombatLog] = useState<string[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [enemyAnimating, setEnemyAnimating] = useState(false);
  const [bossShare, setBossShare] = useState<ShareState | null>(null);

  // Session counters
  const [sessionKills, setSessionKills] = useState(0);
  const [sessionCoins, setSessionCoins] = useState(0);
  const sessionStartRef = useRef(0);
  const [sessionTime, setSessionTime] = useState(0);

  // VFX
  const [floatingNums, setFloatingNums] = useState<FloatNum[]>([]);
  const [shaking, setShaking] = useState(false);
  const [critFlash, setCritFlash] = useState(false);
  const [enemyDying, setEnemyDying] = useState(false);
  const [telegraphMsg, setTelegraphMsg] = useState<string | null>(null);

  const comboCount   = playerData?.comboCount ?? 1;
  const activeStatus = playerData?.playerStatus ?? "none";
  const statusDur    = playerData?.playerStatusDuration ?? 0;

  // Mutable refs so autoTick never sees stale values
  const playerDataRef   = useRef<PlayerState | null>(null);
  const enemyHpRef      = useRef(enemy.baseHp);
  const isBossRef       = useRef(false);
  const enemyRef        = useRef(enemy);
  const publicKeyRef    = useRef(publicKey);
  const onUpdateRef     = useRef(onPlayerDataUpdate);
  const tokenSymbolRef  = useRef(tokenSymbol);

  useEffect(() => { playerDataRef.current  = playerData;        }, [playerData]);
  useEffect(() => { enemyHpRef.current     = enemyHp;           }, [enemyHp]);
  useEffect(() => { isBossRef.current      = isBoss;            }, [isBoss]);
  useEffect(() => { enemyRef.current       = enemy;             }, [enemy]);
  useEffect(() => { publicKeyRef.current   = publicKey;         }, [publicKey]);
  useEffect(() => { onUpdateRef.current    = onPlayerDataUpdate;}, [onPlayerDataUpdate]);
  useEffect(() => { tokenSymbolRef.current = tokenSymbol;       }, [tokenSymbol]);

  // ── Helpers ──────────────────────────────────────────────────────────────

  const addLog = useCallback((msg: string) =>
    setCombatLog((prev) => [msg, ...prev].slice(0, 5)), []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }, []);

  const spawnFloat = useCallback((text: string, color: string, xPct?: number, size = 1.5) => {
    const id = ++numIdRef.current;
    const x  = xPct ?? (15 + Math.random() * 55);
    setFloatingNums((prev) => [...prev, { id, text, color, x, size }]);
    setTimeout(() => setFloatingNums((prev) => prev.filter((n) => n.id !== id)), 1300);
  }, []);

  const triggerShake = useCallback(() => {
    setShaking(true);
    setTimeout(() => setShaking(false), 500);
  }, []);

  // Raw fetch — reads publicKey from ref to avoid stale closures
  const sendAction = useCallback(async (action: string, extra: Record<string, unknown> = {}) => {
    const pk = publicKeyRef.current;
    if (!pk) return null;
    const res = await fetch("/api/game/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, wallet: pk.toString(), ...extra }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error ?? "Action failed");
    }
    return res.json() as Promise<{ playerData: PlayerState; result: Record<string, unknown> }>;
  }, []);

  const spawnNext = useCallback((newKills: number) => {
    const nextIsBoss = newKills > 0 && newKills % 5 === 0;
    const next = randomEnemy();
    const hp   = nextIsBoss ? next.baseHp * 3 : next.baseHp;
    setEnemy(next);
    setEnemyHp(hp);
    setEnemyMaxHp(hp);
    setIsBoss(nextIsBoss);
    if (nextIsBoss) showToast("👑 BOSS INCOMING!");
  }, [showToast]);

  const fetchPlayerData = useCallback(async () => {
    if (!publicKey) return;
    try {
      const res   = await fetch(`/api/game/state?wallet=${publicKey.toString()}`);
      const state: PlayerState = await res.json();
      const isNew = state.tokens === 0 && state.totalKills === 0 &&
                    state.totalPulls === 0 && !state.fighters?.length;
      setInitialized(!isNew);
      setPlayerData(state);
      onPlayerDataUpdate(state);
    } catch { /* ignore */ }
  }, [publicKey, onPlayerDataUpdate]);

  useEffect(() => { fetchPlayerData(); }, [fetchPlayerData]);

  // ── Init ─────────────────────────────────────────────────────────────────

  const initPlayer = useCallback(async () => {
    try {
      const data = await sendAction("init");
      if (data) {
        setPlayerData(data.playerData);
        setInitialized(true);
        onPlayerDataUpdate(data.playerData);
        showToast("Adventure started! ⚔️");
      }
    } catch (e) { showToast(String(e)); }
  }, [sendAction, onPlayerDataUpdate, showToast]);

  // ── Heal ─────────────────────────────────────────────────────────────────

  const healingRef = useRef(false);
  const heal = useCallback(async () => {
    if (healingRef.current) return;
    const pd = playerDataRef.current;
    if (!pd || pd.tokens < 1) return;
    healingRef.current = true;
    try {
      const data = await sendAction("heal");
      if (data) {
        setPlayerData(data.playerData);
        onUpdateRef.current(data.playerData);
        addLog("💚 Healed to full! (−1 🪙)");
        showToast("Healed! 💚");
        // Resume auto-farm if session was already started
        if (sessionStartRef.current > 0) setAutoRunning(true);
      }
    } catch (e) { showToast(String(e)); }
    finally { healingRef.current = false; }
  }, [sendAction, addLog, showToast]);

  // ── Auto-battle tick ──────────────────────────────────────────────────────

  const autoTick = useCallback(async () => {
    if (busyRef.current || respawningRef.current) return;

    const pd = playerDataRef.current;
    if (!pd || pd.health === 0) {
      setAutoRunning(false);
      showToast("☠️ Defeated — heal to resume farming!");
      return;
    }

    busyRef.current = true;
    try {
      const cur  = enemyRef.current;
      const meta = ELEMENT_META[cur.element as EnemyElement];

      // Smart move selection: counter telegraphs, exploit element weakness
      let move: "strike" | "heavy" | "dodge";
      if (pd.enemyTelegraphing) {
        move = "dodge";
      } else {
        move = WEAKNESS_MAP[cur.element] ?? (Math.random() < 0.5 ? "strike" : "heavy");
      }

      const data = await sendAction(move, { enemyName: cur.name });
      if (!data) return;

      const r = data.result as {
        playerDamage: number; enemyDamage: number; dailyBonus: number;
        isCrit: boolean; comboCount: number; comboMult: number;
        isWeakness: boolean; isCounter: boolean; statusApplied: string | null;
        enemyTelegraphing: boolean; burnDamage: number; stunned: boolean;
      };

      setPlayerData(data.playerData);
      onUpdateRef.current(data.playerData);

      if (r.stunned) {
        spawnFloat("STUNNED!", "#a78bfa", 40, 1.8);
        return;
      }

      const elemColor = meta?.color ?? "#a78bfa";
      if (r.burnDamage > 0)
        spawnFloat(`🔥 -${r.burnDamage}`, "#f97316", 68 + Math.random() * 18, 1.3);
      if (r.playerDamage > 0) {
        const label = r.isCrit ? " CRIT!" : r.isWeakness ? " WEAK!" : r.isCounter ? " COUNTER!" : "";
        const color = r.isCrit ? "#fbbf24" : r.isWeakness ? elemColor : r.isCounter ? "#22d3ee" : "#fb923c";
        const size  = r.isCrit ? 2.2 : r.isWeakness || r.isCounter ? 1.9 : 1.5;
        spawnFloat(`+${r.playerDamage}${label}`, color, 12 + Math.random() * 28, size);
      }
      if (r.enemyDamage > 0)
        spawnFloat(`-${r.enemyDamage}`, "#f87171", 56 + Math.random() * 28, 1.4);

      if (r.isCrit || r.enemyDamage > 12) triggerShake();
      if (r.isCrit) { setCritFlash(true); setTimeout(() => setCritFlash(false), 420); }

      if (r.statusApplied === "burn")  showToast("🔥 Burning! −5 HP per turn");
      if (r.statusApplied === "stun")  showToast("💫 Stunned! Next turn skipped");
      if (r.dailyBonus > 0)            showToast(`🌅 Daily bonus! +${r.dailyBonus}🪙`);
      setTelegraphMsg(r.enemyTelegraphing ? "Enemy winds up a crushing blow!" : null);

      setEnemyAnimating(true);
      setTimeout(() => setEnemyAnimating(false), 300);

      const newEnemyHp = enemyHpRef.current - r.playerDamage;
      setEnemyHp(Math.max(0, newEnemyHp));

      if (newEnemyHp <= 0) {
        setEnemyDying(true);
        respawningRef.current = true;

        const killData = await sendAction("kill", { isBoss: isBossRef.current });
        if (killData) {
          setPlayerData(killData.playerData);
          onUpdateRef.current(killData.playerData);

          const earned  = killData.result.tokensEarned as number;
          const streak  = (killData.result.streakBonus  as number) ?? 0;
          const perfect = (killData.result.perfectBonus as number) ?? 0;
          const bonuses = [
            streak  > 0 ? `🔥×${killData.result.killStreak}` : "",
            perfect > 0 ? "⭐perfect" : "",
          ].filter(Boolean).join(" ");

          addLog(`${isBossRef.current ? "👑 Boss" : cur.name} slain! +${earned}🪙${bonuses ? " " + bonuses : ""}`);
          setSessionKills((k) => k + 1);
          setSessionCoins((c) => c + earned);

          const realReward = (killData.result.realReward as number) ?? 0;
          if (realReward > 0) addLog(`🎁 +${realReward} $${tokenSymbolRef.current} airdrop!`);

          if (isBossRef.current) {
            const kills   = killData.playerData.totalKills;
            const bossNum = Math.floor(kills / 5);
            setBossShare({ bossNumber: bossNum, totalKills: kills, tweetUrl: buildBossTweet(bossNum, kills, tokenSymbolRef.current) });
            setTimeout(() => setBossShare(null), 10_000);
          }

          setTimeout(() => {
            setEnemyDying(false);
            setTelegraphMsg(null);
            spawnNext(killData.playerData.totalKills);
            respawningRef.current = false;
          }, 500);
        } else {
          respawningRef.current = false;
        }
      }
    } catch (e) {
      addLog(`⚠️ ${String(e)}`);
    } finally {
      busyRef.current = false;
    }
  }, [sendAction, spawnFloat, triggerShake, spawnNext, addLog, showToast]);

  // Stable ref to latest tick — lets the interval stay alive without restarting
  const tickRef = useRef(autoTick);
  useEffect(() => { tickRef.current = autoTick; }, [autoTick]);

  // ── Interval ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!autoRunning) return;
    const id = setInterval(() => tickRef.current(), 1600);
    return () => clearInterval(id);
  }, [autoRunning]);

  // Session elapsed timer
  useEffect(() => {
    if (!autoRunning) return;
    const id = setInterval(() => {
      setSessionTime(Math.floor((Date.now() - sessionStartRef.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [autoRunning]);

  // ── Controls ─────────────────────────────────────────────────────────────

  const startAuto = useCallback(() => {
    if (sessionStartRef.current === 0) sessionStartRef.current = Date.now();
    setAutoRunning(true);
    showToast("⚔️ Auto-Farm started!");
  }, [showToast]);

  const stopAuto = useCallback(() => {
    setAutoRunning(false);
    showToast("⏹ Farming paused.");
  }, [showToast]);

  // ── Render ────────────────────────────────────────────────────────────────

  if (!publicKey) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-gray-500">
        <p>Connect wallet to play</p>
      </div>
    );
  }

  const enemyHpPct = Math.max(0, (enemyHp / enemyMaxHp) * 100);
  const isDead     = playerData?.health === 0;
  const meta       = ELEMENT_META[enemy.element as EnemyElement];
  const fmtTime    = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className={`relative space-y-4 ${shaking ? "animate-battle-shake" : ""}`}>

      {/* ── Floating damage numbers ───────────────────────────────────────── */}
      <div className="pointer-events-none absolute inset-0 z-50 overflow-hidden rounded-2xl">
        {floatingNums.map((n) => (
          <div key={n.id} className="absolute font-black select-none"
            style={{
              left: `${n.x}%`, top: "25%", fontSize: `${n.size}rem`,
              color: n.color, animation: "float-dmg 1.3s ease-out forwards",
              textShadow: `0 0 12px ${n.color}, 0 2px 6px rgba(0,0,0,0.9)`,
              whiteSpace: "nowrap",
            }}>
            {n.text}
          </div>
        ))}
      </div>

      {/* ── Crit flash ───────────────────────────────────────────────────── */}
      {critFlash && (
        <div className="pointer-events-none absolute inset-0 z-40 rounded-2xl bg-white"
          style={{ animation: "crit-flash 0.42s ease-out forwards" }} />
      )}

      {/* ── Combo counter ────────────────────────────────────────────────── */}
      {comboCount >= 2 && (
        <div className="absolute top-1 right-2 z-30 text-right pointer-events-none">
          <div key={comboCount} className="font-black leading-none"
            style={{
              fontSize: `${1.6 + comboCount * 0.2}rem`,
              color: COMBO_COLORS[Math.min(comboCount - 1, 4)] || "#facc15",
              animation: "combo-pop 0.32s cubic-bezier(.17,.67,.54,1.4)",
              textShadow: `0 0 16px ${COMBO_COLORS[Math.min(comboCount - 1, 4)] || "#facc15"}`,
            }}>
            ×{comboCount}
          </div>
          <div className="text-white/40 text-xs font-bold tracking-widest uppercase">COMBO</div>
        </div>
      )}

      {/* ── Toast ────────────────────────────────────────────────────────── */}
      {toast && (
        <div className="absolute -top-2 left-1/2 -translate-x-1/2 z-50 bg-black/80 border border-white/20 text-white px-4 py-2 rounded-xl text-sm animate-fade-in-down whitespace-nowrap pointer-events-none">
          {toast}
        </div>
      )}

      {/* ── Session stats bar ────────────────────────────────────────────── */}
      {initialized && (sessionKills > 0 || autoRunning) && (
        <div className="flex items-center gap-3 bg-black/30 border border-emerald-900/40 rounded-xl px-4 py-2 text-xs">
          <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${autoRunning ? "bg-emerald-400 animate-pulse" : "bg-white/20"}`} />
          <span className="text-white/30 uppercase tracking-wider font-bold text-[10px]">Session</span>
          <span className="text-yellow-400 font-bold">+{sessionCoins}🪙</span>
          <span className="text-white/50">⚔️ {sessionKills} kills</span>
          <span className="text-white/25 font-mono ml-auto">{fmtTime(sessionTime)}</span>
        </div>
      )}

      {/* ── Enemy card ───────────────────────────────────────────────────── */}
      <div className={`bg-white/5 border ${isBoss ? "border-yellow-500/60 shadow-[0_0_20px_rgba(234,179,8,0.25)]" : "border-white/10"} rounded-2xl p-4 text-center relative overflow-hidden`}>
        {isBoss && (
          <div className="absolute top-2 right-2 text-xs font-bold text-yellow-400 bg-yellow-500/20 px-2 py-0.5 rounded-full border border-yellow-500/40">
            👑 BOSS
          </div>
        )}
        {meta && (
          <div className="absolute top-2 left-2 flex items-center gap-1 bg-black/50 rounded-full px-2 py-0.5 text-xs border border-white/10">
            <span>{meta.emoji}</span>
            <span className="font-medium" style={{ color: meta.color }}>{meta.label}</span>
          </div>
        )}
        <div
          className={`text-6xl mb-2 transition-transform ${enemyAnimating && !enemyDying ? "scale-125" : "scale-100"} duration-150 inline-block`}
          style={enemyDying ? { animation: "kill-burst 0.65s ease-out forwards" } : undefined}
        >
          {enemy.emoji}
        </div>
        <div className="text-white font-bold">{isBoss ? `⚔️ ${enemy.name} (Boss)` : enemy.name}</div>
        <div className="mt-2 space-y-1">
          <div className="flex justify-between text-xs text-gray-400">
            <span>Enemy HP</span>
            <span>{Math.max(0, enemyHp)}/{enemyMaxHp}</span>
          </div>
          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
            <div
              className={`h-full ${isBoss ? "bg-yellow-500" : "bg-red-500"} rounded-full transition-all duration-300`}
              style={{ width: `${enemyHpPct}%` }}
            />
          </div>
        </div>
        {autoRunning && (
          <div className="mt-2.5 flex items-center justify-center gap-1.5">
            <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
            <span className="text-green-400/70 text-xs font-medium tracking-wide">AUTO FARMING</span>
          </div>
        )}
      </div>

      {/* ── Telegraph warning ────────────────────────────────────────────── */}
      {telegraphMsg && (
        <div className="animate-telegraph bg-yellow-500/10 border border-yellow-500/40 rounded-xl px-3 py-2 text-center">
          <div className="text-yellow-300 font-bold text-sm">⚠️ {telegraphMsg}</div>
          <div className="text-yellow-600 text-xs mt-0.5">Auto-dodging for a counter hit!</div>
        </div>
      )}

      {/* ── Player stats ─────────────────────────────────────────────────── */}
      {playerData && initialized && (
        <PlayerStats
          health={playerData.health}
          totalKills={playerData.totalKills}
          totalPulls={playerData.totalPulls}
          atk={playerData.atk}
          def={playerData.def}
          status={activeStatus}
          statusDuration={statusDur}
        />
      )}

      {/* ── Controls ─────────────────────────────────────────────────────── */}
      {!initialized ? (
        <button onClick={initPlayer}
          className="w-full py-3 rounded-xl font-bold text-white bg-gradient-to-r from-violet-600 to-blue-600 hover:opacity-90 transition-all">
          ⚔️ Start Adventure
        </button>
      ) : isDead ? (
        <div className="space-y-3">
          <div className="text-center text-red-400 text-sm animate-pulse py-2">
            ☠️ Defeated — heal to resume farming!
          </div>
          <button onClick={heal}
            disabled={!playerData || playerData.tokens < 1}
            className="w-full py-3 rounded-xl font-bold text-white bg-gradient-to-r from-green-700 to-emerald-700 hover:opacity-90 disabled:opacity-30 transition-all">
            {playerData && playerData.tokens < 1
              ? "💚 Not enough 🪙 to heal — fight in arena to earn!"
              : "💚 Heal to full (costs 1🪙)"}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Main toggle */}
          <button
            onClick={autoRunning ? stopAuto : startAuto}
            className={`w-full py-4 rounded-xl font-black text-lg tracking-wide transition-all ${
              autoRunning
                ? "bg-red-950/60 border-2 border-red-500/50 text-red-300 hover:bg-red-950/80"
                : "bg-gradient-to-r from-red-600 to-orange-600 text-white hover:brightness-110 shadow-[0_0_24px_rgba(239,68,68,0.4)]"
            }`}
          >
            {autoRunning ? "⏹ STOP FARMING" : "⚔️ START FARMING"}
          </button>

          {/* Heal — only visible when HP is low */}
          {playerData && playerData.health < 80 && (
            <button onClick={heal}
              disabled={playerData.tokens < 1}
              className="w-full py-2.5 rounded-xl font-bold text-white bg-gradient-to-r from-green-700 to-emerald-700 hover:opacity-90 disabled:opacity-30 transition-all text-sm">
              💚 Heal to full (costs 1🪙)
            </button>
          )}

          {/* Economy hint — visible when idle */}
          {!autoRunning && (
            <div className="flex items-center justify-center gap-2 text-[10px] text-white/20 pt-1">
              <span>⚔️ Farm → 🪙 COIN</span>
              <span>·</span>
              <span>🪙 COIN → Gacha pulls</span>
              <span>·</span>
              <span>💎 $TOKEN gates access</span>
            </div>
          )}
        </div>
      )}

      {/* ── Combat log ───────────────────────────────────────────────────── */}
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

      {/* ── Boss share ───────────────────────────────────────────────────── */}
      {bossShare && (
        <div className="flex flex-col items-center gap-2 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl animate-fade-in-down">
          <div className="text-yellow-300 font-bold text-sm">
            👑 Boss #{bossShare.bossNumber} defeated! {bossShare.totalKills} kills total
          </div>
          <div className="flex gap-2">
            <a href={bossShare.tweetUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1DA1F2]/20 border border-[#1DA1F2]/40 text-[#1DA1F2] text-xs font-bold hover:bg-[#1DA1F2]/30 transition-all">
              𝕏 Flex on X
            </a>
            <a href={PUMP_FUN_URL} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 text-xs font-bold hover:bg-green-500/20 transition-all">
              🟢 Pump.fun
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
