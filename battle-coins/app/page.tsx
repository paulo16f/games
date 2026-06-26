"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, Egg, Flag, History, LayoutDashboard, Trophy, Users } from "lucide-react";
import {
  ACTION_COSTS,
  EGG_ODDS,
  RARITY_CYCLE_MS,
  TOAD_DAILY_ENERGY,
  TOAD_JUMP_BUY_URL,
  TOAD_JUMP_TOKEN_SYMBOL,
  TOAD_TEMPLATES,
  ToadKind,
} from "@/lib/constants";
import { PlayerState, ProjectRewardsLedger, Toad } from "@/lib/store";

type GameTab = "play" | "frogs" | "hatch" | "races" | "rewards" | "leaderboard" | "seasons" | "creator";

interface GateResult {
  wallet?: string;
  balance?: number;
  symbol?: string;
  gateAmount?: number;
  gated?: boolean;
  configured?: boolean;
  devMode?: boolean;
  error?: string;
}

interface LeaderboardEntry {
  wallet: string;
  nickname?: string;
  dailyJumpScore: number;
  seasonJumpScore: number;
  lifetimeJumps: number;
  racePoints: number;
  activeFrogs: number;
  totalFrogs: number;
  tokenBalance: number;
  topToad: { name: string; level: number; rarity: string; active?: boolean } | null;
}

interface SeasonStats {
  activePlayers: number;
  totalRaces: number;
  totalJumps?: number;
  dailyJumpScore?: number;
  seasonJumpScore?: number;
  totalFlies: number;
  projectLedger: ProjectRewardsLedger;
  rewardLedger?: {
    dailyPoolRemaining: number;
    dailyClaimCount: number;
    totalTokenRewardsPaid: number;
    failedPayouts: number;
  };
}

interface CreatorDashboard {
  ledger: ProjectRewardsLedger;
  rewardLedger?: SeasonStats["rewardLedger"];
  activeJumpersToday: number;
  totalDailyJumpScore: number;
  totalSeasonJumpScore: number;
  topJumpers: Array<{ wallet: string; dailyJumpScore: number; seasonJumpScore: number; lifetimeJumps: number }>;
}



const gameTabs: Array<{ id: GameTab; label: string; Icon: typeof Activity }> = [
  { id: "play",        label: "Home",    Icon: Activity },
  { id: "races",       label: "Races",   Icon: Flag },
  { id: "frogs",       label: "Frogs",   Icon: Users },
  { id: "hatch",       label: "Hatch",   Icon: Egg },
  { id: "leaderboard", label: "Ranks",   Icon: Trophy },
  { id: "seasons",     label: "Season",  Icon: History },
  { id: "creator",     label: "Creator", Icon: LayoutDashboard },
];

const assetPaths = {
  logo: "/frogs/toad-jump-coin.png",
  sourceToads: "/frogs/swamp-toad.png",
  forest: "/frogs/toad-jump-banner.png",
  toads: {
    swamp:   "/frogs/swamp-toad.png",
    poison:  "/frogs/poison-dart.png",
    crystal: "/frogs/crystal-frog.png",
    shadow:  "/frogs/shadow-toad.png",
    emperor: "/frogs/golden-emperor.png",
  } satisfies Record<ToadKind, string>,
  toadSheets: {
    swamp:   "/frogs/swamp-toad-sheet.png",
    poison:  "/frogs/poison-dart-sheet.png",
    crystal: "/frogs/crystal-frog-sheet.png",
    shadow:  "/frogs/shadow-toad-sheet.png",
    emperor: "/frogs/golden-emperor-sheet.png",
  } satisfies Record<ToadKind, string>,
  toadGifs: {
    swamp: "/frogs/swamp-toad.gif",
    poison: "/frogs/poison-dart.gif",
    crystal: "/frogs/crystal-frog.gif",
    shadow: "/frogs/shadow-toad.gif",
    emperor: "/frogs/golden-emperor.gif",
  } as Partial<Record<ToadKind, string>>,
};

const toadTone: Record<ToadKind, string> = {
  swamp:   "border-lime-200/30 bg-lime-300/10",
  poison:  "border-sky-200/30 bg-sky-300/10",
  crystal: "border-cyan-200/35 bg-cyan-300/10",
  shadow:  "border-purple-200/35 bg-purple-300/10",
  emperor: "border-yellow-200/40 bg-yellow-300/10",
};

const toadAccent: Record<ToadKind, string> = {
  swamp:   "border-l-lime-400",
  poison:  "border-l-sky-400",
  crystal: "border-l-cyan-400",
  shadow:  "border-l-purple-400",
  emperor: "border-l-yellow-400",
};

interface EggReveal {
  toad: { kind: ToadKind; name: string; rarity: string };
  isNew: boolean;
  bonusFlies: number;
}

const rarityGlowFilter: Record<string, string> = {
  Common:    "drop-shadow(0 0 40px rgba(134,239,172,0.6))",
  Uncommon:  "drop-shadow(0 0 40px rgba(125,211,252,0.6))",
  Rare:      "drop-shadow(0 0 40px rgba(103,232,249,0.6))",
  Epic:      "drop-shadow(0 0 50px rgba(196,181,253,0.7))",
  Legendary: "drop-shadow(0 0 60px rgba(253,224,71,0.8))",
};

function normalizedHash(): GameTab {
  if (typeof window === "undefined") return "play";
  const rawTab = window.location.hash.replace("#", "");
  const tab = (rawTab === "toads" ? "play" : rawTab) as GameTab;
  return gameTabs.some((entry) => entry.id === tab) ? tab : "play";
}

function shortNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatWallet(wallet: string): string {
  return wallet.length > 12 ? `${wallet.slice(0, 5)}...${wallet.slice(-5)}` : wallet;
}

function tokenBoost(balance: number): { label: string; mult: string; cls: string } {
  if (balance >= 10_000) return { label: "Legend",   mult: "3×",   cls: "boost-badge boost-badge-gold"   };
  if (balance >= 1_000)  return { label: "Whale",    mult: "2×",   cls: "boost-badge boost-badge-purple" };
  if (balance >= 100)    return { label: "Stacker",  mult: "1.5×", cls: "boost-badge boost-badge-blue"   };
  if (balance >= 1)      return { label: "Holder",   mult: "1.2×", cls: "boost-badge boost-badge-green"  };
  return { label: "No boost", mult: "1×", cls: "boost-badge boost-badge-silver" };
}

function FallbackImage({
  src,
  fallback,
  alt,
  className,
}: {
  src: string;
  fallback?: string;
  alt: string;
  className: string;
}) {
  const [currentSrc, setCurrentSrc] = useState(src);

  useEffect(() => {
    setCurrentSrc(src);
  }, [src]);

  return (
    <img
      src={currentSrc}
      alt={alt}
      className={className}
      onError={() => {
        if (fallback && currentSrc !== fallback) setCurrentSrc(fallback);
      }}
    />
  );
}

function SpriteSheet({ src, alt, frames = 8, className }: { src: string; alt: string; frames?: number; className?: string }) {
  return (
    <div className={`overflow-hidden ${className ?? ""}`} title={alt}>
      <img
        src={src}
        alt={alt}
        className="sprite-anim-8 h-full object-cover"
        style={{ width: `${frames * 100}%` }}
      />
    </div>
  );
}


function TabNav({ activeTab, onChange }: { activeTab: GameTab; onChange: (tab: GameTab) => void }) {
  return (
    <>
      <nav className="hidden w-28 shrink-0 flex-col gap-1 xl:flex">
        {gameTabs.map((tab) => (
          <button key={tab.id} onClick={() => onChange(tab.id)} className={`tab-button ${activeTab === tab.id ? "tab-button-active" : ""}`}>
            <tab.Icon size={16} strokeWidth={2} />
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>
      <nav className="fixed inset-x-2 bottom-2 z-40 flex gap-1 overflow-x-auto rounded-2xl border border-yellow-400/20 bg-[#0d0018]/95 p-1.5 shadow-2xl backdrop-blur xl:hidden">
        {gameTabs.map((tab) => (
          <button key={tab.id} onClick={() => onChange(tab.id)} className={`tab-button mobile-tab flex-1 ${activeTab === tab.id ? "tab-button-active" : ""}`}>
            <tab.Icon size={14} strokeWidth={2} />
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>
    </>
  );
}

function TopHud({
  player,
  gate,
  guestMode,
  onConnectWallet,
  onSetNickname,
}: {
  player: PlayerState;
  gate: GateResult | null;
  guestMode?: boolean;
  onConnectWallet?: () => void;
  onSetNickname?: (name: string) => void;
}) {
  const balance = gate?.balance ?? player.tokenBalance;
  const gated = !gate || !(gate.gated ?? false);
  const playerLevel = Math.floor((player.totalXp ?? 0) / 1000) + 1;
  const claimReady = !player.lastFlyClaimAt || (Date.now() - player.lastFlyClaimAt) >= 30 * 60 * 1000;
  const walletShort = (gate?.wallet || player.wallet || "").replace(/(.{4}).+(.{4})$/, "$1…$2");
  const displayName = player.nickname || walletShort;

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");

  function startEdit() {
    setNameInput(player.nickname || "");
    setEditingName(true);
  }
  function commitName() {
    const trimmed = nameInput.trim();
    if (trimmed && trimmed !== player.nickname && onSetNickname) {
      onSetNickname(trimmed);
    }
    setEditingName(false);
  }

  return (
    <header className="sticky top-0 z-30 game-panel">
      <div className="flex items-center gap-2 px-3 py-2">
        {/* Left: logo + wordmark */}
        <FallbackImage
          src={assetPaths.logo}
          fallback={assetPaths.sourceToads}
          alt="Toad Jump"
          className="h-8 w-8 shrink-0 rounded-lg object-cover"
        />
        <span className="pixel text-[11px] text-yellow-300 leading-tight shrink-0">Toad Jump</span>

        {/* Right: game stats */}
        {guestMode ? (
          <div className="ml-auto flex items-center gap-1.5">
            <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1">
              <span className="text-base leading-none">🪰</span>
              <span className="pixel text-sm font-black text-yellow-300">{player.flies}</span>
            </div>
            <button onClick={onConnectWallet} className="pixel text-sm font-bold text-amber-300 hover:text-amber-200 transition-colors">
              Guest · Connect →
            </button>
          </div>
        ) : (
          <div className="ml-auto flex items-center gap-1.5">
            {/* Editable name/wallet */}
            {editingName ? (
              <input
                autoFocus
                value={nameInput}
                onChange={e => setNameInput(e.target.value.slice(0, 20))}
                onKeyDown={e => { if (e.key === "Enter") commitName(); if (e.key === "Escape") setEditingName(false); }}
                onBlur={commitName}
                placeholder="Your name…"
                className="pixel w-28 rounded-lg border border-yellow-400/60 bg-black/50 px-2 py-1 text-xs text-yellow-300 outline-none"
              />
            ) : (
              <button
                onClick={startEdit}
                title="Set display name"
                className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 hover:border-yellow-400/40 hover:bg-white/8 transition-colors group"
              >
                <span className="pixel text-white/55 group-hover:text-white/80 transition-colors" style={{ fontSize: "9px" }}>{displayName}</span>
                <span className="pixel text-white/25 group-hover:text-yellow-300/60 transition-colors" style={{ fontSize: "9px" }}>✎</span>
              </button>
            )}
            {/* Player level */}
            <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1">
              <span className="text-base leading-none">🐸</span>
              <span className="pixel text-sm font-black text-white/70">Lv {playerLevel}</span>
            </div>
            {/* Flies */}
            <div className={`flex items-center gap-1 rounded-lg border px-2 py-1 ${claimReady && !gated ? "border-emerald-400/40 bg-emerald-400/10" : "border-white/10 bg-white/5"}`}>
              <span className="text-base leading-none">🪰</span>
              <span className={`pixel text-sm font-black ${claimReady && !gated ? "text-emerald-300" : "text-yellow-300"}`}>{player.flies}</span>
            </div>
            {/* Token balance */}
            <div className={`flex items-center gap-1 rounded-lg border px-2 py-1 ${!gated ? "border-emerald-400/25 bg-emerald-400/6" : "border-red-400/20 bg-red-400/5"}`}>
              <span className="pixel text-sm font-black text-yellow-300">{shortNumber(balance)}</span>
              <span className="pixel text-white/35" style={{ fontSize: "8px" }}>${gate?.symbol ?? "TOAD"}</span>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}

function EntryScreen({
  walletInput,
  setWalletInput,
  checkAccess,
  onPlayAsGuest,
  busy,
  busyAction,
  message,
  gate,
  tokenSymbol,
}: {
  walletInput: string;
  setWalletInput: (value: string) => void;
  checkAccess: () => void;
  onPlayAsGuest: () => void;
  busy: boolean;
  busyAction: string;
  message: string;
  gate: GateResult | null;
  tokenSymbol: string;
}) {
  const [showBoost, setShowBoost] = useState(false);
  const [showHowTo, setShowHowTo] = useState(true);

  return (
    <main
      className="relative min-h-screen text-white flex flex-col px-4"
      style={{ backgroundImage: `url(${assetPaths.forest})`, backgroundSize: "cover", backgroundPosition: "center" }}
    >
      <div className="absolute inset-0 bg-black/60" />

      {/* Top — hero */}
      <div className="relative z-10 flex flex-col items-center gap-3 pt-12 pb-6">
        <div style={{ filter: "drop-shadow(0 0 28px rgba(255,215,0,0.55))" }}>
          <FallbackImage
            src={assetPaths.logo}
            fallback={assetPaths.sourceToads}
            alt="Toad Jump"
            className="h-24 w-24 object-contain"
          />
        </div>
        <h1 className="pixel text-2xl text-yellow-300 sm:text-3xl">Toad Jump</h1>
        <p className="pixel text-sm text-white/80">Hatch toads. Keep them jumping. Earn real tokens.</p>
      </div>

      {/* Middle — connect card */}
      <div className="relative z-10 flex flex-1 items-center justify-center py-4 px-1">
        <div className="w-full max-w-sm min-w-0 overflow-hidden rounded-xl border border-white/15 bg-black/35 p-4 sm:p-5 backdrop-blur-md">
          <input
            value={walletInput}
            onChange={(event) => setWalletInput(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && checkAccess()}
            placeholder="Paste Solana wallet address"
            className="pixel w-full min-w-0 rounded-lg border border-white/20 bg-white/10 px-3 py-3 text-xs sm:text-sm text-white outline-none placeholder:text-white/55 focus:border-yellow-400/60 transition-colors"
          />
          {message && (
            <div className="pixel mt-2 text-xs sm:text-sm text-white/80 break-words" aria-live="polite">{message}</div>
          )}
          {gate?.balance !== undefined && (
            <div className="pixel mt-1 text-xs sm:text-sm text-white/80">Balance: <span className="font-mono font-bold text-yellow-300">{shortNumber(gate.balance)}</span> {gate.symbol}</div>
          )}
          <div className="mt-4 grid grid-cols-2 gap-3">
            <button
              onClick={checkAccess}
              disabled={busy}
              className="pixel rounded-lg bg-yellow-400 py-3 sm:py-4 text-xs sm:text-sm font-black text-black shadow-[0_4px_0_rgba(0,0,0,0.5),0_0_20px_rgba(255,215,0,0.3)] hover:bg-yellow-300 active:translate-y-[2px] active:shadow-none transition-all disabled:opacity-50"
            >
              {busyAction === "check" ? "Loading..." : "▶ Connect"}
            </button>
            <button
              onClick={onPlayAsGuest}
              disabled={busy}
              className="pixel rounded-lg border border-white/30 bg-white/12 py-3 sm:py-4 text-xs sm:text-sm font-black text-white hover:bg-white/20 active:scale-95 transition-all disabled:opacity-50"
            >
              👁 Guest
            </button>
          </div>
        </div>
      </div>

      {/* Bottom — how to play first, boost tiers collapsed */}
      <div className="relative z-10 w-full max-w-sm mx-auto pb-8 space-y-4">

        {/* How to play — collapsible, starts open */}
        <div>
          <button
            onClick={() => setShowHowTo(v => !v)}
            className="pixel w-full rounded-xl border border-white/15 bg-black/25 backdrop-blur-sm px-4 py-3 text-sm text-white/80 hover:bg-black/35 transition-colors flex items-center justify-between mb-1"
          >
            <span>❓ How to play</span>
            <span className="text-white/45">{showHowTo ? "▲" : "▼"}</span>
          </button>
          {showHowTo && (
            <div className="mt-2 space-y-2">
              {[
                { step: "①", icon: "🥚", title: "Hatch a Toad", desc: "Spend 5 flies → crack an egg → get a random toad!", sub: "5 rarity tiers: Common → Legendary" },
                { step: "②", icon: "⚡", title: "Activate it", desc: "Tap your toad → it jumps automatically!", sub: "Rarer toad = more points per hour" },
                { step: "③", icon: "🪰", title: "Collect flies", desc: "Claim +5 free flies every 30 minutes", sub: "Need 10,000 tokens to unlock claims" },
                { step: "④", icon: "💰", title: "Earn real tokens", desc: "Jump score = share of the daily pool", sub: "Claim straight to your Solana wallet" },
                { step: "⑤", icon: "🏎", title: "Race!", desc: "Enter 30-min races vs other players", sub: "Win tokens or flies as prizes" },
              ].map(item => (
                <div key={item.step} className="flex items-start gap-3 rounded-lg border border-white/12 bg-black/25 backdrop-blur-sm px-3 py-3">
                  <div className="pixel text-base text-yellow-300/70 shrink-0 mt-0.5">{item.step}</div>
                  <div className="text-xl shrink-0">{item.icon}</div>
                  <div className="min-w-0">
                    <div className="pixel text-sm font-black text-white">{item.title}</div>
                    <div className="pixel text-sm text-white/65 leading-snug mt-0.5">{item.desc}</div>
                    <div className="pixel text-sm text-white/35 leading-snug mt-0.5">{item.sub}</div>
                  </div>
                </div>
              ))}
              {/* Guest CTA */}
              <div className="rounded-lg border border-yellow-400/25 bg-yellow-400/8 px-3 py-3">
                <div className="pixel text-sm text-yellow-300 mb-2">👁 You start with 10 flies — enough to hatch 2 toads right now!</div>
                <button
                  onClick={onPlayAsGuest}
                  className="pixel w-full rounded-lg bg-yellow-400 py-2.5 text-sm font-black text-black shadow-[0_3px_0_rgba(0,0,0,0.4)] hover:bg-yellow-300 active:translate-y-[1px] active:shadow-none transition-all"
                >
                  Try as Guest →
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Score multipliers — collapsed by default */}
        <div>
          <button
            onClick={() => setShowBoost(v => !v)}
            className="pixel w-full text-center text-sm text-white/45 hover:text-white/70 transition-colors py-1"
          >
            {showBoost ? "▲ Hide multipliers" : "🔑 Score multipliers ▼"}
          </button>

          {showBoost && (
            <div className="mt-2 space-y-1.5">
              {[
                { mult: "1×",   label: "No boost",  req: "0 tokens",       color: "text-white/55" },
                { mult: "1.2×", label: "Holder",    req: "1+ tokens",      color: "text-white/75" },
                { mult: "1.5×", label: "Stacker",   req: "100+ tokens",    color: "text-white/90" },
                { mult: "2×",   label: "Whale",     req: "1,000+ tokens",  color: "text-yellow-200" },
                { mult: "3×",   label: "Legend",    req: "10,000+ tokens", color: "text-yellow-300" },
              ].map((tier) => (
                <div key={tier.mult} className="flex items-center justify-between rounded-lg border border-white/12 bg-black/25 backdrop-blur-sm px-3 py-2.5">
                  <span className={`pixel text-sm font-black ${tier.color}`}>{tier.mult} {tier.label}</span>
                  <span className="pixel text-sm text-white/60">{tier.req}</span>
                </div>
              ))}
              <a
                href={TOAD_JUMP_BUY_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="pixel mt-3 block text-center text-sm text-yellow-300/75 hover:text-yellow-300 transition-colors"
              >
                Buy {tokenSymbol} to boost →
              </a>
            </div>
          )}
        </div>

      </div>
    </main>
  );
}


function AnimNum({ value, fmt }: { value: number; fmt?: (n: number) => string }) {
  const [disp, setDisp] = useState(value);
  const raf = useRef<number | null>(null);
  const prev = useRef(value);
  useEffect(() => {
    const from = prev.current;
    prev.current = value;
    if (from === value) return;
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - t0) / 500, 1);
      const e = 1 - (1 - t) ** 3;
      setDisp(Math.round(from + (value - from) * e));
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [value]);
  return <>{fmt ? fmt(disp) : disp}</>;
}

function toadEarningInfo(toad: Toad) {
  const scorePerJump = Math.max(1, Math.round(
    (toad.speed * 0.35 + toad.stamina * 0.25 + toad.luck * 0.20 + toad.consistency * 0.20) / 10
    + (toad.level - 1) * 1.5
  ));
  const cycleMs = RARITY_CYCLE_MS[toad.rarity] ?? 45_000;
  const intervalMin = cycleMs / 60_000;
  const ptsPerHour = Math.round(scorePerJump * (3_600_000 / cycleMs));
  const sprintFlies = toad.kind === "shadow" && Math.random() < 0.35 ? 3 : 2;
  return { scorePerJump, intervalMin, ptsPerHour, sprintFlies };
}

function FlyClaimStrip({
  player,
  balance,
  gated,
  busy,
  claimDailyFlies,
  claimFliesSkip,
}: {
  player: PlayerState;
  balance: number;
  gated: boolean;
  busy: boolean;
  claimDailyFlies: () => void;
  claimFliesSkip: () => void;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const COOLDOWN = 30 * 60 * 1000;
  const lastClaim = player.lastFlyClaimAt ?? 0;
  const elapsed = now - lastClaim;
  const onCooldown = lastClaim > 0 && elapsed < COOLDOWN;
  const remaining = COOLDOWN - elapsed;
  const mins = Math.floor(remaining / 60_000);
  const secs = Math.floor((remaining % 60_000) / 1000);

  return (
    <div className="rounded-xl border border-yellow-400/20 bg-yellow-400/5 px-4 py-3">
      {/* Row 1: label + big count */}
      <div className="flex items-center justify-between">
        <span className="pixel text-base text-white/50">🪰 Flies</span>
        <span className="pixel text-2xl font-black text-yellow-300 leading-none">{player.flies}</span>
      </div>
      {/* Row 2: status + action */}
      <div className="flex items-center justify-between gap-3 mt-2">
        <span className="pixel text-base text-white/40 min-w-0 leading-loose">
          {gated
            ? "🔒 Buy tokens to unlock free flies"
            : onCooldown
            ? `⏳ ${mins}:${String(secs).padStart(2, "0")} until next claim`
            : "▶ Free +5 flies ready!"}
        </span>
        <div className="flex gap-2 shrink-0">
          {!gated && onCooldown && balance >= 1_000 && (
            <button onClick={claimFliesSkip} disabled={busy}
              className="pixel text-sm rounded border border-yellow-200/35 bg-yellow-300/12 px-2.5 py-1.5 text-yellow-200 hover:bg-yellow-300/22 transition-all disabled:opacity-40">
              Skip
            </button>
          )}
          {!gated ? (
            <button onClick={claimDailyFlies} disabled={busy || onCooldown}
              className="pixel text-sm rounded bg-yellow-400 px-3 py-1.5 text-black shadow-[0_3px_0_rgba(0,0,0,0.4)] hover:bg-yellow-300 active:translate-y-[1px] active:shadow-none transition-all disabled:opacity-40">
              {onCooldown ? "✓ Claimed" : "Claim +5 🪰"}
            </button>
          ) : (
            <a href={TOAD_JUMP_BUY_URL} target="_blank" rel="noopener noreferrer"
              className="pixel text-sm rounded bg-yellow-400 px-3 py-1.5 text-black shadow-[0_3px_0_rgba(0,0,0,0.4)] hover:bg-yellow-300 transition-all">
              Buy →
            </a>
          )}
        </div>
      </div>
    </div>
  );
}


function LiveJumpStats({ toad, scorePerJump, dailyJumpScore, compact = false, ptsPerHour }: { toad: Toad; scorePerJump: number; dailyJumpScore: number; compact?: boolean; ptsPerHour?: number }) {
  const [liveHops, setLiveHops] = useState(0);

  useEffect(() => {
    const CYCLE = RARITY_CYCLE_MS[toad.rarity] ?? 5_000;
    const anchor = toad.lastJumpAt || Date.now();
    const tick = () => setLiveHops(Math.max(0, Math.floor((Date.now() - anchor) / CYCLE)));
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [toad.rarity, toad.lastJumpAt]);

  const totalPts = dailyJumpScore + liveHops * scorePerJump;

  if (compact) {
    return (
      <div className="space-y-1.5">
        <div className={`grid text-center gap-1.5 ${ptsPerHour !== undefined ? "grid-cols-3" : "grid-cols-2"}`}>
          {ptsPerHour !== undefined && (
            <div className="rounded-lg border border-yellow-400/15 bg-yellow-400/6 px-2 py-2">
              <div className="pixel text-sm font-black text-yellow-300 leading-none">+<AnimNum value={ptsPerHour} fmt={shortNumber} /></div>
              <div className="pixel text-xs text-white/45 mt-1">pts/hr</div>
            </div>
          )}
          <div className="rounded-lg border border-white/8 bg-white/3 px-2 py-2">
            <div className="pixel text-sm font-black text-white leading-none"><AnimNum value={liveHops} /></div>
            <div className="pixel text-xs text-white/45 mt-1">hops now</div>
          </div>
          <div className="rounded-lg border border-yellow-400/10 bg-yellow-400/4 px-2 py-2">
            <div className="pixel text-sm font-black text-yellow-300 leading-none"><AnimNum value={totalPts} fmt={shortNumber} /></div>
            <div className="pixel text-xs text-white/45 mt-1">pts today</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/10 w-full">
      <div className="text-center">
        <div className="pixel font-mono text-2xl font-black text-white"><AnimNum value={liveHops} /></div>
        <div className="pixel text-sm text-white/60 mt-0.5">Live hops</div>
      </div>
      <div className="text-center">
        <div className="pixel font-mono text-2xl font-black text-yellow-300"><AnimNum value={totalPts} fmt={shortNumber} /></div>
        <div className="pixel text-sm text-white/60 mt-0.5">Pts today</div>
      </div>
    </div>
  );
}

function ToadSprite({ toad, className }: { toad: Toad; className: string }) {
  const [jumping, setJumping] = useState(true);
  const gifSrc = assetPaths.toadGifs[toad.kind];
  const staticSrc = assetPaths.toads[toad.kind];

  useEffect(() => {
    const cycle = RARITY_CYCLE_MS[toad.rarity] ?? 5_000;
    function hop() {
      setJumping(true);
      const holdMs = Math.min(cycle * 0.55, 1400);
      setTimeout(() => setJumping(false), holdMs);
    }
    hop();
    const id = setInterval(hop, cycle);
    return () => clearInterval(id);
  }, [toad.rarity]);

  if (jumping && gifSrc) {
    return <img src={gifSrc} alt={toad.name} className={`${className} block object-contain`} />;
  }
  if (jumping) {
    return <SpriteSheet src={assetPaths.toadSheets[toad.kind]} alt={toad.name} className={className} />;
  }
  return (
    <img src={staticSrc} alt={toad.name} className={`${className} object-contain`} />
  );
}

function PlayTab({
  player,
  busy,
  gate,
  season,
  leaderboard,
  goToFrogs,
  claimDailyFlies,
  claimFliesSkip,
  claimReward,
  lastClaimResult,
  showHelp,
}: {
  player: PlayerState;
  busy: boolean;
  gate: GateResult | null;
  season: SeasonStats | null;
  leaderboard: LeaderboardEntry[];
  goToFrogs: () => void;
  claimDailyFlies: () => void;
  claimFliesSkip: () => void;
  claimReward: () => void;
  lastClaimResult: { claim: { status: string; netAmount: number; fliesGranted: number; txSignature: string | null; error: string | null; amount: number }; retry: boolean } | null;
  showHelp: () => void;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const activeToads = player.toads.filter(t => t.active);

  const [livePtsExtra, setLivePtsExtra] = useState(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const tick = () => {
      let extra = 0;
      for (const toad of activeToads) {
        const { scorePerJump } = toadEarningInfo(toad);
        const CYCLE = RARITY_CYCLE_MS[toad.rarity] ?? 5_000;
        const anchor = toad.lastJumpAt || Date.now();
        extra += Math.max(0, Math.floor((Date.now() - anchor) / CYCLE)) * scorePerJump;
      }
      setLivePtsExtra(extra);
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [activeToads.map(t => `${t.id}:${t.lastJumpAt}:${t.rarity}`).join(",")]);
  const totalLivePts = player.dailyJumpScore + livePtsExtra;

  const balance = gate?.balance ?? player.tokenBalance;
  const gateAmount = gate?.gateAmount ?? 50_000;
  const gated = !gate || !(gate.gated ?? false);
  const symbol = gate?.symbol ?? "TOAD";
  const totalPtsPerHour = activeToads.reduce((sum, t) => sum + toadEarningInfo(t).ptsPerHour, 0);
  const isLive = activeToads.length > 0;

  // Reward estimate (rank-weighted)
  const dailyPool = season?.projectLedger.dailyActivePool ?? 0;
  const sortedLb = [...leaderboard].sort((a, b) => b.dailyJumpScore - a.dailyJumpScore);
  const myRankIdx = sortedLb.findIndex(e => e.wallet === player.wallet || e.wallet.startsWith(player.wallet.slice(0, 4)));
  const myRank = myRankIdx >= 0 ? myRankIdx + 1 : 0;
  const weightedTotal = sortedLb.reduce((s, e, i) => s + e.dailyJumpScore * rankMultiplierClient(i + 1), 0);
  const myMult = myRank > 0 ? rankMultiplierClient(myRank) : 1;
  const myShare = weightedTotal > 0 ? (player.dailyJumpScore * myMult) / weightedTotal : 0;
  const myEstimate = Math.min(500, Math.floor(dailyPool * myShare * 100) / 100);

  // Fly claim
  const COOLDOWN = 30 * 60 * 1000;
  const lastClaim = player.lastFlyClaimAt ?? 0;
  const elapsed = now - lastClaim;
  const flyOnCooldown = lastClaim > 0 && elapsed < COOLDOWN;
  const flyRemaining = COOLDOWN - elapsed;
  const flyMins = Math.floor(flyRemaining / 60_000);
  const flySecs = Math.floor((flyRemaining % 60_000) / 1000);

  // Token reward cooldown
  const rewardCooldownMs = player.nextRewardClaimAt ? player.nextRewardClaimAt - now : 0;
  const rewardOnCooldown = rewardCooldownMs > 0;
  const canClaimReward = !busy && !rewardOnCooldown && player.dailyJumpScore > 0 && !gated;
  const alreadyAutoPaid = player.lastAutoPaidDate === new Date().toISOString().slice(0, 10);

  return (
    <section className="space-y-4">

      {/* ══ 1. ACTIVE FROGS ═════════════════════════════════ */}
      {activeToads.length > 0 ? (
        <div className="space-y-3">
          {activeToads.map(toad => {
            const { scorePerJump, ptsPerHour } = toadEarningInfo(toad);
            return (
              <div key={toad.id} className={`overflow-hidden rounded-2xl border border-l-[5px] ${toadTone[toad.kind]} ${toadAccent[toad.kind]}`}>
                <div className="flex items-center gap-4 p-4">
                  <ToadSprite toad={toad} className="h-24 w-24 shrink-0" />
                  <div className="flex-1 min-w-0 space-y-2">
                    <div>
                      <div className="pixel text-xl font-black text-white leading-tight truncate">{toad.name}</div>
                      <div className="pixel text-sm text-white/55 mt-0.5">{toad.rarity} · Level {toad.level}</div>
                    </div>
                    <LiveJumpStats toad={toad} scorePerJump={scorePerJump} dailyJumpScore={player.dailyJumpScore} ptsPerHour={ptsPerHour} compact />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="game-panel flex flex-col items-center gap-5 py-14 text-center">
          <div className="text-7xl opacity-25">🐸</div>
          <div className="space-y-1">
            <div className="pixel text-lg font-black text-white/60">No frogs jumping yet</div>
            <div className="pixel text-sm text-white/40">Your frogs earn you tokens while you sleep.</div>
          </div>
          <button onClick={goToFrogs}
            className="pixel text-base rounded-xl bg-yellow-400 px-6 py-3 font-black text-black shadow-[0_4px_0_rgba(0,0,0,0.4)] hover:bg-yellow-300 active:translate-y-[2px] active:shadow-none transition-all">
            Go to Frogs →
          </button>
        </div>
      )}

      {/* ══ 2. TODAY'S EARNINGS ═════════════════════════════ */}
      <div className="game-panel px-5 py-5 space-y-3 text-center" style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(255,215,0,0.08) 0%, transparent 70%)" }}>
        <div className="pixel text-xs font-black text-yellow-400/60 uppercase tracking-widest">Today&apos;s Earnings</div>
        <div>
          <div className="pixel text-5xl font-black text-yellow-300 leading-none">
            <AnimNum value={totalLivePts} fmt={shortNumber} />
          </div>
          <div className="pixel text-base text-white/55 mt-2">jump points earned today</div>
        </div>
        {isLive ? (
          <div className="flex items-center justify-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <span className="pixel text-sm text-emerald-300">
              Earning +<AnimNum value={totalPtsPerHour} fmt={shortNumber} /> more points per hour
            </span>
          </div>
        ) : (
          <div className="pixel text-sm text-white/35">Activate a frog above to start earning</div>
        )}
      </div>

      {/* ══ 3. TOKEN REWARD ═════════════════════════════════ */}
      {totalLivePts === 0 ? (
        <div className="game-panel px-5 py-6 text-center space-y-2">
          <div className="text-2xl">🪙</div>
          <div className="pixel text-base font-black text-white">Your Daily Token Reward</div>
          <div className="pixel text-sm text-white/55">Activate a frog to start earning. Tokens are paid automatically at the end of each day.</div>
        </div>
      ) : alreadyAutoPaid ? (
        <div className="game-panel px-5 py-6 text-center space-y-3">
          <div className="text-3xl">✅</div>
          <div className="pixel text-xl font-black text-green-300">Paid Today</div>
          <div className="pixel text-sm text-white/55">Your token reward was sent to your wallet automatically.</div>
        </div>
      ) : (
        <div className="game-panel px-5 py-5 space-y-4 text-center">
          <div className="pixel text-xs font-black text-yellow-400/60 uppercase tracking-widest">Your Daily Token Reward</div>
          <div>
            <div className="pixel text-5xl font-black text-yellow-300 leading-none">
              ≈ {shortNumber(myEstimate)}
            </div>
            <div className="pixel text-sm text-white/55 mt-2">{symbol} tokens · paid automatically at end of day</div>
          </div>
          {canClaimReward && (
            <button onClick={claimReward} disabled={busy}
              className="pixel text-base w-full rounded-xl bg-yellow-400 py-4 font-black text-black shadow-[0_4px_0_rgba(0,0,0,0.45)] hover:bg-yellow-300 active:translate-y-[2px] active:shadow-none transition-all disabled:opacity-40">
              {busy ? "Claiming…" : "Claim Early"}
            </button>
          )}
          {lastClaimResult && (() => {
            const c = lastClaimResult.claim;
            if (c.txSignature) return (
              <div className="rounded-xl border border-lime-400/25 bg-lime-400/8 px-4 py-3 space-y-1">
                <div className="pixel text-sm font-black text-lime-300">+{shortNumber(c.netAmount)} {symbol} sent on-chain!</div>
                <div className="font-mono text-xs text-white/30 truncate">{c.txSignature.slice(0, 24)}…</div>
              </div>
            );
            if (c.fliesGranted > 0) return (
              <div className="rounded-xl border border-sky-400/25 bg-sky-400/8 px-4 py-3">
                <div className="pixel text-sm text-sky-300">+{c.fliesGranted} flies granted</div>
              </div>
            );
            if (c.error) return (
              <div className="rounded-xl border border-red-400/25 bg-red-400/8 px-4 py-3 flex items-center justify-between gap-2">
                <span className="pixel text-sm text-red-300">Transfer failed — try again</span>
                {lastClaimResult.retry && (
                  <button onClick={claimReward} disabled={busy} className="pixel text-sm rounded-lg bg-red-400/20 px-3 py-1.5 text-red-200 hover:bg-red-400/30 transition-colors disabled:opacity-40">
                    Retry
                  </button>
                )}
              </div>
            );
            return null;
          })()}
        </div>
      )}

      {/* ══ 4. FLIES ════════════════════════════════════════ */}
      <div className="game-panel px-5 py-5 space-y-4 text-center">
        <div className="pixel text-xs font-black text-yellow-400/60 uppercase tracking-widest">🪰 Flies — Your Game Currency</div>
        <div className="flex items-end justify-center gap-3">
          {(lastClaimResult?.claim?.fliesGranted ?? 0) > 0 ? (
            <>
              <div className="pixel text-4xl font-black text-yellow-300 leading-none">+{lastClaimResult!.claim.fliesGranted}</div>
              <div className="pixel text-sm text-white/50 pb-1">flies from this claim</div>
            </>
          ) : (
            <>
              <div className="pixel text-4xl font-black text-yellow-300 leading-none">{player.flies}</div>
              <div className="pixel text-sm text-white/50 pb-1">flies available</div>
            </>
          )}
        </div>
        <div className="pixel text-sm text-white/45">Use flies to race, hatch eggs, and upgrade your frogs.</div>
        {gated ? (
          <a href={TOAD_JUMP_BUY_URL} target="_blank" rel="noopener noreferrer"
            className="pixel text-base block w-full text-center rounded-xl bg-yellow-400 py-3 font-black text-black shadow-[0_4px_0_rgba(0,0,0,0.4)] hover:bg-yellow-300 transition-all">
            Buy tokens to unlock free flies →
          </a>
        ) : flyOnCooldown ? (
          <div className="space-y-2">
            <div className="rounded-xl border border-white/8 bg-white/3 px-4 py-3 text-center">
              <div className="pixel text-base font-black text-white/55">
                Next claim in {flyMins}:{String(flySecs).padStart(2, "0")}
              </div>
            </div>
            {balance >= 1_000 && (
              <button onClick={claimFliesSkip} disabled={busy}
                className="pixel text-sm w-full rounded-xl border border-yellow-400/30 bg-yellow-400/10 py-2.5 font-black text-yellow-300 hover:bg-yellow-400/20 transition-all disabled:opacity-40">
                Skip wait (costs 1,000 {symbol})
              </button>
            )}
          </div>
        ) : (
          <button onClick={claimDailyFlies} disabled={busy}
            className="pixel text-base w-full rounded-xl bg-yellow-400 py-3 font-black text-black shadow-[0_4px_0_rgba(0,0,0,0.45),0_0_20px_rgba(255,215,0,0.2)] hover:bg-yellow-300 active:translate-y-[2px] active:shadow-none transition-all disabled:opacity-40">
            Claim +5 Free Flies
          </button>
        )}
      </div>

      {/* ══ 5. YOUR RECORD ══════════════════════════════════ */}
      <div className="game-panel px-5 py-5 space-y-4">
        <div className="pixel text-xs font-black text-white/40 uppercase tracking-widest text-center">Your Record</div>
        <div className="grid grid-cols-2 gap-3">
          {[
            { v: myRank > 0 ? `#${myRank}` : "—",      top: "Leaderboard rank",   bot: "among all players", color: "text-yellow-300" },
            { v: String(player.wins),                    top: "Race wins",           bot: "total victories",   color: "text-emerald-300" },
            { v: shortNumber(player.seasonJumpScore),    top: "Season points",       bot: "this week",         color: "text-purple-300" },
            { v: shortNumber(player.lifetimeJumpScore),  top: "All-time points",     bot: "lifetime total",    color: "text-sky-300" },
          ].map(({ v, top, bot, color }) => (
            <div key={top} className="rounded-xl border border-white/8 bg-white/3 px-4 py-3">
              <div className={`pixel text-2xl font-black leading-none ${color}`}>{v}</div>
              <div className="pixel text-sm text-white/60 mt-1.5 font-black">{top}</div>
              <div className="pixel text-xs text-white/35 mt-0.5">{bot}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ══ 6. UNLOCK BANNER ════════════════════════════════ */}
      {gated && gate?.configured !== false && (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-400/8 px-5 py-5 space-y-4">
          <div className="pixel text-base font-black text-amber-300">🔒 Earning is Locked</div>
          <div className="pixel text-sm text-white/55">
            Buy {shortNumber(gateAmount)} {symbol} on Pump.fun to unlock:
          </div>
          <div className="space-y-2">
            {[
              "Collect free flies every 30 minutes",
              "Earn tokens from your jump score",
              "Enter races for token prizes",
            ].map(item => (
              <div key={item} className="flex items-center gap-2.5">
                <span className="text-emerald-400 text-sm shrink-0">✓</span>
                <span className="pixel text-sm text-white/65">{item}</span>
              </div>
            ))}
          </div>
          <a href={TOAD_JUMP_BUY_URL} target="_blank" rel="noopener noreferrer"
            className="pixel text-base block w-full text-center rounded-xl bg-yellow-400 py-3.5 font-black text-black shadow-[0_4px_0_rgba(0,0,0,0.4),0_0_24px_rgba(255,215,0,0.25)] hover:bg-yellow-300 transition-all">
            Buy {symbol} on Pump.fun →
          </a>
        </div>
      )}

      {/* How to Play link */}
      <div className="text-center pt-1 pb-2">
        <button onClick={showHelp} className="pixel text-sm text-white/30 hover:text-white/60 underline transition-colors">
          ? How to Play
        </button>
      </div>

    </section>
  );
}

function racePotential(toad: Toad): { luckPts: number; levelPts: number; statPts: number; total: number } {
  const luckPts  = Math.round((toad.luck / 100) * 15);
  const levelPts = Math.round(Math.min((toad.level - 1) * 1.0, 12));
  const statPts  = Math.round(toad.speed * 0.025 + toad.stamina * 0.02 + toad.consistency * 0.015);
  return { luckPts, levelPts, statPts, total: luckPts + levelPts + statPts };
}



function RacesTab({
  player,
  season,
  busy,
  guestMode,
  enterRaceEventWithToad,
}: {
  player: PlayerState;
  season: SeasonStats | null;
  busy: boolean;
  guestMode?: boolean;
  enterRaceEventWithToad: (toadId: string) => void;
}) {
  const [now, setNow] = useState(Date.now());
  const [raceChampions, setRaceChampions] = useState<{ wallet: string; nickname?: string; wins: number; totalRaces: number; racePoints: number }[]>([]);
  const [raceEntrants, setRaceEntrants] = useState<{ name: string; toadName: string; toadRarity: string; toadLevel: number }[]>([]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const load = () => fetch("/api/races/leaderboard").then(r => r.json()).then(setRaceChampions).catch(() => {});
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const load = () => fetch("/api/races/current").then(r => r.json()).then(d => setRaceEntrants(d.entrants ?? [])).catch(() => {});
    load();
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
  }, []);

  const selectedToad = player.toads.length > 0
    ? player.toads.reduce((best, toad) =>
        racePotential(toad).total >= racePotential(best).total ? toad : best
      )
    : null;

  const windowId = Math.floor(now / 1_800_000);
  const endsAt = (windowId + 1) * 1_800_000;
  const remaining = endsAt - now;
  const windowAge = now % 1_800_000;
  const isTallying = windowAge < 30_000;
  const mins = Math.floor(remaining / 60_000);
  const secs = Math.floor((remaining % 60_000) / 1000);
  const isClosing = remaining < 60_000;

  const alreadyEntered = player.lastRaceWindowId === windowId;
  const racePool = season?.projectLedger.racePool ?? 0;
  const result = player.lastRaceResult;

  const enterButtonLabel = () => {
    if (guestMode) return "Connect wallet to enter";
    if (busy) return "Entering...";
    if (isTallying) return "Tallying last race…";
    if (alreadyEntered) return raceEntrants.length >= 3 ? "✓ Enrolled · Race on!" : "⏳ Enrolled — waiting for 3+ players";
    if (isClosing) return "Race closing — wait for next";
    if (!selectedToad) return "Hatch a frog first!";
    if (player.flies < 2) return "Need 2 flies to enter";
    return "🏁 Enter Race · 2 🪰";
  };
  const canEnter = !guestMode && !busy && !isTallying && !alreadyEntered && !isClosing && !!selectedToad && player.flies >= 2;
  const enterButtonStyle = alreadyEntered
    ? "bg-emerald-600/30 text-emerald-200 border border-emerald-400/20"
    : isClosing
    ? "bg-amber-300/15 text-amber-200 border border-amber-300/20"
    : canEnter
    ? "bg-yellow-400 text-black shadow-[0_4px_0_rgba(0,0,0,0.5),0_0_24px_rgba(255,215,0,0.35)] hover:bg-yellow-300 active:translate-y-[2px] active:shadow-none"
    : "bg-white/8 text-white/30 border border-white/10";

  const rankBorder = (rank: number) =>
    rank === 1 ? "border-yellow-300/40 bg-yellow-300/10" :
    rank === 2 ? "border-white/25 bg-white/8" :
    rank === 3 ? "border-amber-400/30 bg-amber-300/8" :
    "border-white/10 bg-white/4";

  const timeAgo = (ts: number) => {
    const diffMin = Math.floor((Date.now() - ts) / 60_000);
    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    return `${Math.floor(diffMin / 60)}h ago`;
  };

  const podiumMedal = (i: number) => i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`;

  return (
    <section className="space-y-3">

      {/* Instant rewards callout */}
      <div className="flex items-center gap-3 rounded-xl border border-green-400/20 bg-green-400/6 px-4 py-3">
        <span className="text-2xl shrink-0">⚡</span>
        <div>
          <div className="pixel text-sm font-black text-green-300">Instant Rewards</div>
          <div className="pixel text-xs text-white/55">Win tokens and flies the moment the race ends — no waiting.</div>
        </div>
      </div>

      {/* Zone A — Race Hero: timer + pool + enrollment */}
      <div className="game-panel px-4 py-4" style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(255,215,0,0.07) 0%, transparent 70%)" }}>
        <div className="pixel text-xs text-white/40 uppercase tracking-widest mb-3 text-center">Current Race Window</div>
        <div className="grid grid-cols-3 gap-2">
          <div className="flex flex-col items-center gap-1 rounded-lg border border-white/8 bg-white/3 px-2 py-3">
            {isTallying ? (
              <>
                <div className="pixel text-base text-amber-300 animate-pulse leading-none">…</div>
                <div className="pixel text-xs text-white/45 mt-1">Tallying</div>
              </>
            ) : (
              <>
                <div className={`pixel text-2xl leading-none ${isClosing ? "animate-pulse text-red-400" : "text-yellow-300"}`}>
                  {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
                </div>
                <div className="pixel text-xs text-white/45 mt-1">Closes in</div>
              </>
            )}
          </div>
          <div className="flex flex-col items-center gap-1 rounded-lg border border-yellow-400/15 bg-yellow-400/5 px-2 py-3">
            <div className="pixel text-2xl leading-none text-yellow-300">{shortNumber(racePool)}</div>
            <div className="pixel text-xs text-yellow-400/60 mt-1">Prize pool</div>
          </div>
          <div className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-3 ${alreadyEntered ? "border-emerald-400/20 bg-emerald-400/5" : "border-white/8 bg-white/3"}`}>
            <div className={`pixel text-2xl leading-none ${alreadyEntered ? "text-emerald-300" : "text-white/55"}`}>
              {alreadyEntered ? "✓" : raceEntrants.length > 0 ? String(raceEntrants.length) : "—"}
            </div>
            <div className={`pixel text-xs mt-1 ${alreadyEntered ? "text-emerald-400/70" : "text-white/40"}`}>
              {alreadyEntered ? "You&apos;re in!" : "Players"}
            </div>
          </div>
        </div>
        <div className="pixel text-sm text-white/35 text-center mt-2">
          {alreadyEntered
            ? raceEntrants.length >= 3
              ? "Race on · waiting for window to close!"
              : `${3 - raceEntrants.length} more player${3 - raceEntrants.length === 1 ? "" : "s"} needed — pool carries over if cancelled`
            : "Every 30 min · 3 real players minimum"}
        </div>
      </div>

      {/* Zone D — Enter button */}
      <button
        onClick={() => selectedToad && enterRaceEventWithToad(selectedToad.id)}
        disabled={!canEnter || busy}
        className={`pixel text-base w-full rounded-xl py-4 transition-all disabled:opacity-50 ${enterButtonStyle}`}
      >
        {enterButtonLabel()}
      </button>

      {/* Zone B — Side by side: Your Racer | In This Race */}
      <div className="grid grid-cols-2 gap-3 items-start">

        {/* Left: Your Racer */}
        {selectedToad ? (() => {
          const pot = racePotential(selectedToad);
          const bars = [
            { label: "Luck",  value: Math.round((selectedToad.luck / 100) * 15), max: 15, color: "bg-yellow-400" },
            { label: "Level", value: Math.round(Math.min((selectedToad.level - 1) * 1.0, 12)), max: 12, color: "bg-purple-400" },
            { label: "Stats", value: Math.round(selectedToad.speed * 0.025 + selectedToad.stamina * 0.02 + selectedToad.consistency * 0.015), max: 12, color: "bg-sky-400" },
          ];
          return (
            <div className="game-panel p-4 space-y-3">
              <div className="pixel text-xs text-white/40 uppercase tracking-widest text-center">Your Racer</div>

              {/* Frog identity */}
              <div className={`flex flex-col items-center gap-2 rounded-xl p-3 ${toadTone[selectedToad.kind]}`}>
                <img src={assetPaths.toads[selectedToad.kind]} alt="" className="h-20 w-20 object-contain" />
                <div className="text-center">
                  <div className="pixel text-sm font-black text-white leading-snug">{selectedToad.name}</div>
                  <div className="pixel text-xs text-white/50 mt-0.5">{selectedToad.rarity} · Lv {selectedToad.level}</div>
                </div>
              </div>

              {/* Stat bars */}
              <div className="space-y-2">
                {bars.map(b => (
                  <div key={b.label}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="pixel text-xs text-white/50">{b.label}</span>
                      <span className="pixel text-xs font-black text-white/80">+{b.value}</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                      <div className={`h-full rounded-full ${b.color}`} style={{ width: `${Math.min(100, Math.round((b.value / b.max) * 100))}%` }} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Bonus + luck note */}
              <div className="rounded-lg bg-yellow-400/8 border border-yellow-400/20 px-3 py-2 text-center">
                <div className="pixel text-sm font-black text-yellow-300">+{pot.total} pts bonus</div>
                <div className="pixel text-xs text-white/40 mt-0.5">75% luck · any frog can win</div>
              </div>
            </div>
          );
        })() : (
          <div className="game-panel p-4 flex flex-col items-center gap-2 text-center">
            <div className="text-3xl">🥚</div>
            <div className="pixel text-sm text-white/40 leading-loose">No toads yet<br/>go hatch one!</div>
          </div>
        )}

        {/* Right: In This Race */}
        <div className="game-panel p-3 space-y-2">
          <div className="pixel text-xs text-white/40 uppercase tracking-widest text-center">
            In This Race · {raceEntrants.length}/3+
          </div>
          {raceEntrants.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-3 text-center">
              <div className="text-2xl">🏁</div>
              <div className="pixel text-sm text-white/35 leading-loose">Be the first<br/>to enter!</div>
            </div>
          ) : (
            <div className="space-y-1.5">
              {raceEntrants.map((e, i) => (
                <div key={i} className="rounded-lg border border-white/8 bg-white/3 px-2 py-2">
                  <div className="pixel text-sm text-white font-black truncate">{e.name}</div>
                  <div className="pixel text-xs text-white/40 mt-0.5">{e.toadRarity} · Lv {e.toadLevel}</div>
                </div>
              ))}
            </div>
          )}
          {raceEntrants.length < 3 && (
            <div className="pixel text-xs text-white/30 text-center">
              Need {Math.max(0, 3 - raceEntrants.length)} more to start
            </div>
          )}
        </div>
      </div>

      {/* Zone C — Prize breakdown */}
      <div className="game-panel px-4 py-4 space-y-3">
        <div className="pixel text-xs text-white/40 uppercase tracking-widest text-center">Prize Breakdown</div>
        <div className="grid grid-cols-3 gap-2">
          {[
            { medal: "🥇", share: "40%" },
            { medal: "🥈", share: "25%" },
            { medal: "🥉", share: "15%" },
          ].map(t => (
            <div key={t.share} className="rounded-lg border border-white/8 bg-white/3 px-2 py-3 text-center">
              <div className="text-xl">{t.medal}</div>
              <div className="pixel text-sm font-black text-yellow-300 mt-1.5">{t.share}</div>
              <div className="pixel text-xs text-white/35 mt-1">of pool</div>
            </div>
          ))}
        </div>
        <div className="pixel text-xs text-white/30 text-center">
          2 flies refunded if cancelled · pool carries over untouched
        </div>
      </div>

      {/* Zone E — Last race result */}
      {result && (result.rank === 0 ? (
        <div className="game-panel px-4 py-4 text-center space-y-2">
          <div className="pixel text-xs text-white/40 uppercase tracking-widest">Last Race Result</div>
          <div className="text-2xl">🚫</div>
          <div className="pixel text-sm text-white/65">Race cancelled — not enough players</div>
          <div className="pixel text-sm text-sky-300">+2 flies refunded</div>
        </div>
      ) : (
        <div className="game-panel px-4 py-4">
          <div className="pixel text-xs text-white/40 uppercase tracking-widest mb-3">Last Race Result</div>
          <div className="grid grid-cols-3 gap-2">
            <div className={`rounded-lg border px-2 py-2.5 text-center ${rankBorder(result.rank)}`}>
              <div className={`pixel text-2xl ${result.rank === 1 ? "text-yellow-300" : result.rank <= 3 ? "text-white" : "text-white/60"}`}>
                #{result.rank}
              </div>
              <div className="pixel text-xs text-white/45 mt-1">Rank</div>
            </div>
            <div className="rounded-lg border border-yellow-300/20 bg-yellow-300/8 px-2 py-2.5 text-center">
              <div className="pixel text-2xl text-yellow-200">{shortNumber(result.score)}</div>
              <div className="pixel text-xs text-yellow-200/55 mt-1">Score</div>
            </div>
            <div className="rounded-lg border border-yellow-200/20 bg-yellow-300/8 px-2 py-2.5 text-center">
              <div className="pixel text-xl text-yellow-200">
                {result.tokensAwarded > 0 ? shortNumber(result.tokensAwarded) : `+${result.fliesAwarded}`}
              </div>
              <div className="pixel text-xs text-yellow-200/55 mt-1">
                {result.tokensAwarded > 0 ? "Tokens" : "Flies 🪰"}
              </div>
            </div>
          </div>
          {result.toadName && (
            <div className="pixel text-xs text-white/40 text-center mt-2.5">
              Raced with {result.toadName}
            </div>
          )}
        </div>
      ))}

      {/* Zone F — My race history */}
      {(player.raceHistory ?? []).length > 0 && (
        <div className="game-panel px-4 py-4">
          <div className="pixel text-xs text-white/40 uppercase tracking-widest mb-3">My Races</div>
          <div className="space-y-1.5">
            {(player.raceHistory ?? []).slice(0, 5).map((entry, i) => (
              <div key={i} className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${rankBorder(entry.rank)}`}>
                <span className={`pixel text-sm w-6 shrink-0 font-black ${entry.rank === 1 ? "text-yellow-300" : entry.rank <= 3 ? "text-white" : "text-white/50"}`}>
                  #{entry.rank}
                </span>
                <span className="pixel text-sm text-white/55 min-w-0 flex-1 truncate">{entry.toadName || "—"}</span>
                <span className="pixel text-sm text-yellow-200 shrink-0">
                  {entry.tokensAwarded > 0 ? `+${shortNumber(entry.tokensAwarded)} tkn` : `+${entry.fliesAwarded} 🪰`}
                </span>
                <span className="pixel text-xs text-white/30 shrink-0">{timeAgo(entry.timestamp)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Zone G — Race Champions */}
      <div className="game-panel px-4 py-4">
        <div className="pixel text-xs text-white/40 uppercase tracking-widest mb-3">Race Champions</div>
        {raceChampions.length === 0 ? (
          <div className="pixel text-sm text-white/35 text-center py-4">No race winners yet — be the first!</div>
        ) : (
          <div className="space-y-1.5">
            {raceChampions.slice(0, 10).map((entry, i) => (
              <div key={entry.wallet} className="flex items-center gap-2 rounded-lg border border-white/6 bg-white/3 px-3 py-2">
                <span className="pixel text-sm shrink-0 w-7 text-center">{podiumMedal(i)}</span>
                <span className="pixel text-sm text-white/55 min-w-0 flex-1 truncate">{entry.nickname ?? entry.wallet}</span>
                <span className="pixel text-sm font-black text-yellow-300 shrink-0">{entry.wins}W</span>
                <span className="pixel text-xs text-white/35 shrink-0">
                  {entry.totalRaces > 0 ? `${Math.round((entry.wins / entry.totalRaces) * 100)}%` : "—"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

    </section>
  );
}

function FrogsTab({
  player,
  busy,
  activateToad,
  deactivateToad,
  feedToad,
  canFeed,
}: {
  player: PlayerState;
  busy: boolean;
  activateToad: (id: string) => void;
  deactivateToad: (id: string) => void;
  feedToad: (id: string) => void;
  canFeed: boolean;
}) {
  const statIcon: Record<string, string> = {
    "Leap":  "💨",
    "Vigor": "🌿",
    "Fate":  "🔮",
    "Focus": "🌙",
  };
  const statChipBg: Record<string, string> = {
    "Leap":  "bg-cyan-400/12",
    "Vigor": "bg-lime-400/12",
    "Fate":  "bg-violet-400/12",
    "Focus": "bg-indigo-400/12",
  };
  const statChipLabel: Record<string, string> = {
    "Leap":  "text-cyan-300",
    "Vigor": "text-lime-300",
    "Fate":  "text-violet-300",
    "Focus": "text-indigo-300",
  };

  return (
    <section className="space-y-3">
      {player.toads.map(toad => {
        const xpNeeded = toad.level * 25;
        const xpPct = Math.min(100, Math.round((toad.xp / xpNeeded) * 100));
        const stats: [string, number][] = [
          ["Leap",  toad.speed],
          ["Vigor", toad.stamina],
          ["Fate",  toad.luck],
          ["Focus", toad.consistency],
        ];
        return (
          <div
            key={toad.id}
            className={`overflow-hidden rounded-xl border border-l-[5px] ${toadAccent[toad.kind]} ${toadTone[toad.kind]} transition-all`}
          >
            {/* Image on top with Active badge top-right */}
            <div className={`relative flex justify-center py-5 ${toad.active ? "bg-yellow-400/6" : ""}`}>
              <img
                src={assetPaths.toads[toad.kind]}
                alt={toad.name}
                className={`h-32 w-32 object-contain transition-all duration-300 ${toad.active ? "" : "grayscale opacity-40"}`}
              />
              {toad.active && (
                <span className="pixel absolute right-3 top-3 rounded bg-yellow-400 px-2 py-0.5 text-xs font-black text-black shadow-[0_0_8px_rgba(255,215,0,0.5)]">
                  Active
                </span>
              )}
            </div>

            {/* Info below */}
            <div className="flex flex-1 flex-col gap-2 min-w-0 px-4 pb-4">
              <div className="text-center">
                <div className="pixel text-xl font-black text-white">{toad.name}</div>
                <div className="pixel text-sm text-white/60 mt-0.5">{toad.rarity} · Level {toad.level}</div>
              </div>

                {/* XP bar */}
                <div>
                  <div className="pixel mb-1 flex justify-between text-xs text-white/55">
                    <span>{toad.xp}/{xpNeeded} XP</span>
                    <span>→ Level {toad.level + 1}</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/12">
                    <div className="h-full rounded-full bg-yellow-400 transition-all" style={{ width: `${xpPct}%` }} />
                  </div>
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-2 gap-1.5">
                  {stats.map(([k, v]) => (
                    <div key={k} className={`flex items-center justify-between rounded-lg px-2 py-1.5 ${statChipBg[k]}`}>
                      <span className={`pixel text-xs ${statChipLabel[k]}`}>{statIcon[k]} {k}</span>
                      <span className="pixel text-xs font-bold text-white/90">{v}</span>
                    </div>
                  ))}
                </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 border-t border-white/8 px-4 py-3">
              <button
                onClick={() => toad.active ? deactivateToad(toad.id) : activateToad(toad.id)}
                disabled={busy}
                className={`pixel flex-1 rounded-lg py-3 text-base font-black transition-all disabled:opacity-50 ${
                  toad.active
                    ? "bg-yellow-400/18 text-yellow-200 hover:bg-yellow-400/28"
                    : "bg-white/6 text-white/65 hover:bg-white/12"
                }`}
              >
                {toad.active ? "⏸ Pause" : "▶ Activate"}
              </button>
              <button
                onClick={() => feedToad(toad.id)}
                disabled={!canFeed}
                title="Feed: spend 2 flies for XP boost"
                className="pixel flex shrink-0 items-center gap-1.5 rounded-lg bg-yellow-400 px-3 py-3 text-xs font-black text-black shadow-[0_3px_0_rgba(0,0,0,0.4)] hover:bg-yellow-300 active:translate-y-[2px] active:shadow-none disabled:opacity-35 transition-all"
              >
                <span className="text-sm leading-none">🪰</span>
                Feed
              </button>
            </div>
          </div>
        );
      })}
      {player.toads.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <div className="text-5xl opacity-40">🥚</div>
          <div className="pixel text-base text-white/40">No frogs yet — go hatch one!</div>
        </div>
      )}
    </section>
  );
}

function HatchTab({
  player,
  busy,
  openEgg,
  eggResult,
  onClearEgg,
  goToFrogs,
}: {
  player: PlayerState;
  busy: boolean;
  openEgg: () => void;
  eggResult: EggReveal | null;
  onClearEgg: () => void;
  goToFrogs: () => void;
}) {
  const [phase, setPhase] = useState<"idle" | "opening" | "revealed">("idle");

  useEffect(() => {
    if (eggResult) setPhase("revealed");
  }, [eggResult]);

  function handleOpen() {
    setPhase("opening");
    openEgg();
  }

  function handleClear() {
    onClearEgg();
    setPhase("idle");
  }

  const rarityBannerStyle = (rarity: string) => {
    switch (rarity) {
      case "Legendary": return "border-yellow-400/40 bg-yellow-400/10 text-yellow-300";
      case "Epic":      return "border-purple-400/40 bg-purple-400/10 text-purple-300";
      case "Rare":      return "border-sky-400/40 bg-sky-400/10 text-sky-300";
      default:          return "border-white/15 bg-white/5 text-white/50";
    }
  };

  return (
    <section className="game-panel">
      <div className="flex min-h-[560px] flex-col items-center justify-center gap-5 px-4 py-10 text-center">

        {phase === "idle" && (
          <>
            {/* Arcade marquee */}
            <div className="pixel text-base text-yellow-400/70 uppercase tracking-widest rounded-lg border border-yellow-400/20 bg-yellow-400/5 px-4 py-2">
              ▶ INSERT FLIES TO HATCH ◀
            </div>

            {/* Floating glowing egg */}
            <div className="relative flex items-center justify-center">
              <div className="egg-aura absolute h-44 w-44 rounded-full bg-yellow-300/20 blur-2xl" />
              <div className="egg-float relative z-10 flex h-48 w-48 items-center justify-center text-[96px] drop-shadow-[0_8px_32px_rgba(255,215,0,0.40)]">
                🥚
              </div>
            </div>

            {/* Title */}
            <div>
              <h2 className="pixel text-lg text-yellow-300">TOAD EGG</h2>
              <p className="pixel text-base text-white/50 mt-3 leading-loose">HATCH · GAIN XP · WIN FLIES</p>
            </div>

            {/* Open button */}
            <button
              onClick={handleOpen}
              disabled={busy || player.flies < ACTION_COSTS.openEgg}
              className="pixel text-[13px] rounded-xl bg-yellow-400 px-10 py-4 text-black shadow-[0_5px_0_rgba(0,0,0,0.55),0_0_30px_rgba(255,215,0,0.40)] hover:bg-yellow-300 active:translate-y-[2px] active:shadow-[0_3px_0_rgba(0,0,0,0.5)] transition-all disabled:opacity-40"
            >
              OPEN EGG · {ACTION_COSTS.openEgg} 🪰
            </button>

            {/* Drop rate table */}
            <div className="w-full max-w-xs">
              <div className="pixel text-base text-white/60 uppercase tracking-widest text-center mb-3">Drop rates</div>
              <div className="space-y-1.5">
                {[
                  { name: "Swamp Toad",     chance: "58%", color: "text-lime-300",   row: "border-lime-300/10 bg-lime-300/4" },
                  { name: "Poison Dart",    chance: "20%", color: "text-sky-300",    row: "border-sky-300/10 bg-sky-300/4" },
                  { name: "Crystal Frog",   chance: "14%", color: "text-cyan-300",   row: "border-cyan-300/10 bg-cyan-300/4" },
                  { name: "Shadow Toad",    chance: "6%",  color: "text-purple-300", row: "border-purple-300/10 bg-purple-300/4" },
                  { name: "Golden Emperor", chance: "2%",  color: "text-yellow-300", row: "border-yellow-400/20 bg-yellow-400/8" },
                  { name: "Void Ancient",   chance: "V2",  color: "text-white/25",   row: "border-white/8 bg-white/3" },
                ].map(r => (
                  <div key={r.name} className={`flex items-center justify-between rounded-lg border px-3 py-2 ${r.row}`}>
                    <span className={`pixel text-base ${r.color}`}>{r.name}</span>
                    <span className={`pixel text-base font-bold ${r.color}`}>{r.chance}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {phase === "opening" && (
          <>
            <div className="relative flex items-center justify-center">
              <div className="egg-aura absolute h-56 w-56 rounded-full bg-yellow-300/25 blur-3xl" />
              <div className="egg-opening relative z-10 flex h-64 w-64 items-center justify-center text-[120px] drop-shadow-[0_0_48px_rgba(255,215,0,0.55)]">
                🥚
              </div>
            </div>
            <div className="pixel animate-pulse text-[13px] text-yellow-300 tracking-widest">HATCHING...</div>
          </>
        )}

        {phase === "revealed" && eggResult && (
          <>
            {/* Rarity banner */}
            <div className={`pixel text-base uppercase tracking-widest rounded-lg border px-4 py-2 ${rarityBannerStyle(eggResult.toad.rarity)}`}>
              {eggResult.isNew ? "✨ NEW FROG — " : "⟳ DUPLICATE — "}{eggResult.toad.rarity.toUpperCase()}
            </div>

            {/* Frog reveal */}
            <div className="frog-reveal">
              <img
                src={assetPaths.toads[eggResult.toad.kind]}
                alt={eggResult.toad.name}
                className="mx-auto h-56 w-56 object-contain"
                style={{ filter: rarityGlowFilter[eggResult.toad.rarity] ?? "none" }}
              />
            </div>

            {/* Name + XP */}
            <div className="text-center">
              <div className="pixel text-base text-white leading-loose">{eggResult.toad.name}</div>
              {!eggResult.isNew && (
                <div className="pixel text-base text-white/50 mt-2">+XP gained · +{eggResult.bonusFlies} 🪰 returned</div>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex gap-3">
              <button
                onClick={handleClear}
                disabled={busy}
                className="pixel text-[13px] rounded-xl bg-yellow-400 px-6 py-3.5 text-black shadow-[0_4px_0_rgba(0,0,0,0.45),0_0_24px_rgba(255,215,0,0.35)] hover:bg-yellow-300 active:translate-y-[2px] active:shadow-none transition-all disabled:opacity-40"
              >
                OPEN AGAIN
              </button>
              <button
                onClick={() => { handleClear(); goToFrogs(); }}
                className="pixel text-[13px] rounded-xl border border-white/15 bg-white/8 px-6 py-3.5 text-white/70 hover:bg-white/14 transition-colors"
              >
                MY FROGS
              </button>
            </div>
          </>
        )}

      </div>
    </section>
  );
}

function rankMultiplierClient(rank: number): number {
  if (rank === 1) return 2;
  if (rank <= 3) return 1.5;
  if (rank <= 10) return 1.2;
  return 1;
}

function LeaderboardTab({ leaderboard, season }: { leaderboard: LeaderboardEntry[]; season: SeasonStats | null }) {
  const top3 = leaderboard.slice(0, 3);
  const rest  = leaderboard.slice(3);

  const podiumMedal  = (i: number) => ["🥇", "🥈", "🥉"][i];
  const podiumBorder = (i: number) => [
    "border-yellow-300/40 bg-yellow-300/8 shadow-[0_0_18px_rgba(255,215,0,0.12)]",
    "border-white/18 bg-white/5",
    "border-amber-600/28 bg-amber-700/6",
  ][i];
  const podiumScore  = (i: number) => ["text-yellow-300", "text-white/75", "text-amber-400"][i];

  return (
    <section className="game-panel p-4 space-y-4">

      {/* Header */}
      <div className="text-center">
        <div className="pixel text-sm text-white/40 uppercase tracking-widest mb-2">Daily rankings</div>
        <h2 className="pixel text-xl text-yellow-300">Top Jumpers</h2>
        <div className="pixel text-sm text-white/40 mt-2">
          {season?.activePlayers ?? 0} players · {shortNumber(season?.totalJumps ?? 0)} jumps today
        </div>
      </div>

      {leaderboard.length ? (
        <>
          {/* Podium — top 3 */}
          <div className="grid grid-cols-3 gap-2">
            {top3.map((entry, i) => {
              const boost = tokenBoost(entry.tokenBalance);
              return (
                <div key={entry.wallet} className={`rounded-xl border p-3 text-center ${podiumBorder(i)}`}>
                  <div className="text-2xl mb-1">{podiumMedal(i)}</div>
                  <div className={`pixel text-lg font-black ${podiumScore(i)}`}><AnimNum value={entry.dailyJumpScore} fmt={shortNumber} /></div>
                  <div className="pixel text-sm text-white/45 mt-1 truncate">{entry.nickname ?? entry.wallet}</div>
                  {boost.mult !== "1×" && (
                    <span className={`mt-1.5 inline-block ${boost.cls}`}>{boost.mult}</span>
                  )}
                  <div className="pixel text-sm text-white/35 mt-1">{entry.activeFrogs} frogs</div>
                  {entry.topToad && (
                    <div className="pixel text-sm text-white/30 mt-0.5 truncate">{entry.topToad.name}</div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Ranks 4+ */}
          {rest.length > 0 && (
            <div className="space-y-1.5">
              {rest.map((entry, i) => {
                const boost = tokenBoost(entry.tokenBalance);
                return (
                  <div key={entry.wallet} className="flex items-center gap-3 rounded-lg border border-white/6 bg-white/3 px-3 py-2.5">
                    <span className="pixel text-sm text-white/28 w-7 shrink-0">#{i + 4}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="pixel text-sm text-white/65 truncate">{entry.nickname ?? entry.wallet}</span>
                        {boost.mult !== "1×" && <span className={`shrink-0 ${boost.cls}`}>{boost.mult}</span>}
                      </div>
                      <div className="pixel text-sm text-white/35 mt-0.5">{entry.activeFrogs}/{entry.totalFrogs} frogs jumping</div>
                    </div>
                    <span className="pixel text-sm font-black text-yellow-300 shrink-0"><AnimNum value={entry.dailyJumpScore} fmt={shortNumber} /></span>
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <div className="py-10 flex flex-col items-center gap-4 text-center">
          <div className="text-5xl">🏆</div>
          <div className="pixel text-base text-yellow-300">Be #1 today!</div>
          <div className="pixel text-sm text-white/40 leading-loose">No jumps recorded yet.<br/>Activate a frog and claim the top spot.</div>
        </div>
      )}
    </section>
  );
}

function SeasonsTab({ currentSeasonId }: { currentSeasonId: string }) {
  const features = [
    { icon: "🥇", title: "Weekly Prizes",   desc: "Top jumpers split token rewards every Sunday — proportional to season score." },
    { icon: "🔥", title: "Burn Events",     desc: "Creator fees burned permanently. Fewer tokens in supply — holders benefit." },
    { icon: "🏪", title: "Frog Market",     desc: "Trade rare frogs with other players for SOL or $TOAD." },
    { icon: "🎬", title: "Live Races",      desc: "Real-time animated races — watch your frog sprint against rivals." },
    { icon: "🔐", title: "Wallet Sign-in",  desc: "One-click login with Phantom or Solflare. No more copy-paste." },
    { icon: "🏆", title: "Season Archives", desc: "Every rank, prize, and personal record preserved forever." },
  ];

  return (
    <section className="game-panel p-4 space-y-5">

      {/* Hero */}
      <div className="text-center space-y-3">
        <div className="pixel text-sm text-yellow-400/65 uppercase tracking-widest">Season 1 · Pre-launch</div>
        <h2 className="pixel text-xl text-yellow-300 leading-loose">V2 Is Loading...</h2>

        <div className="rounded-xl border border-yellow-400/22 bg-yellow-400/5 p-4 text-center space-y-2">
          <p className="pixel text-sm text-white/65 leading-loose">
            Every jump you make <span className="text-yellow-300">right now</span> counts toward Season 1 rankings.
          </p>
          <p className="pixel text-sm text-white/65 leading-loose">
            Hatch rarer frogs. Keep them active. Hold {TOAD_JUMP_TOKEN_SYMBOL} tokens to multiply your score up to <span className="text-yellow-300">3×</span>.
          </p>
          <p className="pixel text-sm text-yellow-300 leading-loose">
            When V2 drops, your position is already locked in.
          </p>
        </div>

        <div className="inline-flex items-center gap-3 rounded-lg border border-yellow-400/22 bg-yellow-400/7 px-4 py-2.5">
          <span className="pixel text-sm text-white/45">Active season</span>
          <span className="pixel text-sm text-yellow-300 font-black">{currentSeasonId}</span>
        </div>
      </div>

      {/* Feature cards — 2 col grid */}
      <div>
        <div className="pixel text-base text-white/50 uppercase tracking-widest text-center mb-3">Coming in V2</div>
        <div className="grid grid-cols-2 gap-2">
          {features.map(f => (
            <div key={f.title} className="rounded-xl border border-white/8 bg-white/3 p-3">
              <div className="text-xl mb-2">{f.icon}</div>
              <div className="pixel text-sm text-white/80 mb-1.5">{f.title}</div>
              <div className="pixel text-sm text-white/40 leading-loose">{f.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="rounded-xl border border-yellow-400/22 bg-yellow-400/5 p-4 text-center">
        <div className="text-3xl mb-2">🐸</div>
        <p className="pixel text-sm text-white/60 leading-loose">
          The best time to start jumping was yesterday.<br/>The second best time is <span className="text-yellow-300">right now</span>.
        </p>
      </div>

    </section>
  );
}

function CreatorTab({ dashboard, busy, recordCreatorRewards }: { dashboard: CreatorDashboard | null; busy: boolean; recordCreatorRewards: (amount: number, key: string) => void }) {
  const [amount, setAmount] = useState("");
  const [key, setKey] = useState("");
  const [raceAmount, setRaceAmount] = useState("");
  const [raceKey, setRaceKey] = useState("");
  const [showRaceForm, setShowRaceForm] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const ledger = dashboard?.ledger;

  const lastSyncAt = ledger?.lastAutoSyncAt ?? 0;
  const syncAge = lastSyncAt ? Date.now() - lastSyncAt : null;
  const syncAgeText =
    syncAge === null ? "Never"
    : syncAge < 60_000 ? "Just now"
    : syncAge < 3_600_000 ? `${Math.floor(syncAge / 60_000)}m ago`
    : `${Math.floor(syncAge / 3_600_000)}h ago`;

  return (
    <section className="space-y-3">

      {/* Treasury stats — FIRST */}
      <div className="game-panel p-4 space-y-3">
        <div className="pixel text-base text-white/55 uppercase tracking-widest text-center mb-3">Treasury stats</div>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: "Reward pool",     value: shortNumber(ledger?.dailyActivePool ?? 0) },
            { label: "Paid to players", value: shortNumber(ledger?.totalJumpRewardsPaid ?? 0) },
            { label: "Total burned",    value: shortNumber(ledger?.totalTokensBurned ?? 0) },
            { label: "Burned today",    value: shortNumber(ledger?.dailyTokensBurned ?? 0) },
            { label: "Today's score",   value: shortNumber(dashboard?.totalDailyJumpScore ?? 0) },
            { label: "Season total",    value: shortNumber(dashboard?.totalSeasonJumpScore ?? 0) },
          ].map(stat => (
            <div key={stat.label} className="rounded-xl border border-white/8 bg-white/4 p-3 flex flex-col items-center gap-2 text-center">
              <div className="pixel text-sm text-white/55 leading-loose">{stat.label}</div>
              <div className="pixel text-xl font-black text-yellow-300">{stat.value}</div>
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-yellow-400/18 bg-yellow-400/5 p-3 text-center">
          <p className="pixel text-sm text-white/50 leading-loose">
            100% of Pump.fun creator fees go to the daily active pool, split proportionally by jump score.
          </p>
        </div>
      </div>

      {/* Auto-sync panel */}
      <div className="game-panel p-4 space-y-4">
        <div className="text-center">
          <div className="pixel text-sm text-white/45 uppercase tracking-widest mb-2">Automated · On-chain</div>
          <div className="flex items-baseline justify-center gap-3">
            <h2 className="pixel text-xl text-yellow-300">Auto-sync</h2>
            <span className="pixel text-base text-yellow-300">{syncAgeText}</span>
          </div>
          <p className="pixel text-sm text-white/55 leading-loose mt-3">
            Auto-sync runs every 15 min via cron-job.org, fetches SOL transfers to the treasury wallet, and credits 100% to the reward pool — no manual steps required.
          </p>
        </div>

        {/* Sync stats grid */}
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: "Total syncs",    value: String(ledger?.autoSyncCount ?? 0) },
            { label: "Jumpers today",  value: String(dashboard?.activeJumpersToday ?? 0) },
            { label: "Total recorded", value: shortNumber(ledger?.creatorRewardsRecorded ?? 0) },
            { label: "Last sync",      value: syncAgeText },
          ].map(stat => (
            <div key={stat.label} className="rounded-xl border border-white/8 bg-white/4 p-3 flex flex-col items-center gap-2 text-center">
              <div className="pixel text-sm text-white/55 leading-loose">{stat.label}</div>
              <div className="pixel text-xl font-black text-yellow-300">{stat.value}</div>
            </div>
          ))}
        </div>

        {ledger?.lastProcessedSignature && (
          <div className="text-center">
            <div className="pixel text-sm text-white/30 mb-1">Last tx</div>
            <div className="truncate font-mono text-sm text-white/35">{ledger.lastProcessedSignature}</div>
          </div>
        )}

        <button
          onClick={() => setShowManual((v) => !v)}
          className="pixel text-sm w-full rounded-lg border border-white/8 bg-white/4 px-3 py-2.5 text-white/35 transition-colors hover:bg-white/8"
        >
          {showManual ? "Hide manual override" : "Manual override ↓"}
        </button>
        {showManual && (
          <div className="space-y-2">
            <input value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Amount received (SOL)" className="pixel text-sm w-full rounded-lg border border-white/10 bg-white/6 px-3 py-2.5 text-white outline-none placeholder:text-white/28 focus:border-yellow-400/50 transition-colors" />
            <input value={key} onChange={(event) => setKey(event.target.value)} placeholder="Creator dashboard key" type="password" className="pixel text-sm w-full rounded-lg border border-white/10 bg-white/6 px-3 py-2.5 text-white outline-none placeholder:text-white/28 focus:border-yellow-400/50 transition-colors" />
            <button onClick={() => recordCreatorRewards(Number(amount), key)} disabled={busy || !Number(amount)} className="pixel text-sm w-full rounded-lg bg-yellow-400 px-4 py-2.5 font-black text-black shadow-[0_3px_0_rgba(0,0,0,0.4)] hover:bg-yellow-300 active:translate-y-[2px] active:shadow-none disabled:opacity-40">
              Record manually
            </button>
          </div>
        )}
      </div>

      {/* Fund race pool */}
      <div className="game-panel p-4 space-y-4">
        <div className="text-center">
          <div className="pixel text-sm text-white/45 uppercase tracking-widest mb-2">Race Prize Pool</div>
          <div className="flex items-baseline justify-center gap-3">
            <h2 className="pixel text-xl text-yellow-300">Fund Race Pool</h2>
            <span className="pixel text-base text-yellow-300">{shortNumber(ledger?.racePool ?? 0)}</span>
          </div>
          <p className="pixel text-sm text-white/55 leading-loose mt-2">
            Tokens added here are distributed as race prizes — 40% to 1st, 25% to 2nd, 15% to 3rd.
          </p>
        </div>
        <button
          onClick={() => setShowRaceForm((v) => !v)}
          className="pixel text-sm w-full rounded-lg border border-white/8 bg-white/4 px-3 py-2.5 text-white/35 transition-colors hover:bg-white/8"
        >
          {showRaceForm ? "Hide form" : "Add funds ↓"}
        </button>
        {showRaceForm && (
          <div className="space-y-2">
            <input value={raceAmount} onChange={(e) => setRaceAmount(e.target.value)} placeholder="Amount (tokens)" className="pixel text-sm w-full rounded-lg border border-white/10 bg-white/6 px-3 py-2.5 text-white outline-none placeholder:text-white/28 focus:border-yellow-400/50 transition-colors" />
            <input value={raceKey} onChange={(e) => setRaceKey(e.target.value)} placeholder="Creator dashboard key" type="password" className="pixel text-sm w-full rounded-lg border border-white/10 bg-white/6 px-3 py-2.5 text-white outline-none placeholder:text-white/28 focus:border-yellow-400/50 transition-colors" />
            <button
              onClick={async () => {
                const res = await fetch("/api/creator/rewards", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount: Number(raceAmount), key: raceKey, target: "race" }) });
                if (res.ok) { setRaceAmount(""); setRaceKey(""); setShowRaceForm(false); }
              }}
              disabled={busy || !Number(raceAmount)}
              className="pixel text-sm w-full rounded-lg bg-yellow-400 px-4 py-2.5 font-black text-black shadow-[0_3px_0_rgba(0,0,0,0.4)] hover:bg-yellow-300 active:translate-y-[2px] active:shadow-none disabled:opacity-40"
            >
              Fund Race Pool
            </button>
          </div>
        )}
      </div>

    </section>
  );
}

function HowToPlayModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75">
      <div className="flex min-h-full items-center justify-center px-4 pt-20 pb-28">
        <div className="bg-[#12122a] border border-white/12 rounded-2xl w-full max-w-lg p-6 space-y-5 shadow-2xl">
          <h2 className="text-2xl font-black text-center text-yellow-300">How to Play</h2>
          <div className="space-y-4">
            {[
              { emoji: "🥚", title: "Hatch a Frog", body: "Go to the Hatch tab and spend 5 flies to crack an egg. You get a random frog — the rarer, the better." },
              { emoji: "🐸", title: "Activate Your Frog", body: "Open the Frogs tab and tap Activate. Your frog starts jumping on its own — no action needed." },
              { emoji: "📈", title: "Earn Points", body: "Each jump earns points. Rarer frogs jump more often and score higher." },
              { emoji: "🪙", title: "Get Tokens", body: "Your daily points turn into token rewards. The higher your score, the bigger your share. Tokens are sent to your wallet automatically." },
            ].map(({ emoji, title, body }) => (
              <div key={title} className="flex gap-4 items-start rounded-xl border border-white/8 bg-white/4 px-4 py-4">
                <span className="text-3xl shrink-0 mt-0.5">{emoji}</span>
                <div className="min-w-0">
                  <p className="text-base font-black text-white">{title}</p>
                  <p className="text-sm text-white/65 mt-1 leading-relaxed">{body}</p>
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={onClose}
            className="w-full py-4 rounded-xl bg-green-500 text-black font-black text-lg hover:bg-green-400 active:scale-95 transition-all"
          >
            Got it — let&apos;s play!
          </button>
          <p className="text-center text-xs text-white/35">Tap &quot;? How to Play&quot; on the Home tab to see this again</p>
        </div>
      </div>
    </div>
  );
}

function GameShell({
  activeTab,
  setTab,
  player,
  gate,
  message,
  leaderboard,
  season,
  creatorDashboard,
  busy,
  activateToad,
  deactivateToad,
  openEgg,
  feedToad,
  recordCreatorRewards,
  enterRaceEventWithToad,
  eggResult,
  onClearEgg,
  claimDailyFlies,
  claimFliesSkip,
  claimReward,
  lastClaimResult,
  guestMode,
  onConnectWallet,
  kvOk,
  setNickname,
}: {
  activeTab: GameTab;
  setTab: (tab: GameTab) => void;
  player: PlayerState;
  gate: GateResult | null;
  message: string;
  leaderboard: LeaderboardEntry[];
  season: SeasonStats | null;
  creatorDashboard: CreatorDashboard | null;
  busy: boolean;
  activateToad: (id: string) => void;
  deactivateToad: (id: string) => void;
  openEgg: () => void;
  feedToad: (id: string) => void;
  recordCreatorRewards: (amount: number, key: string) => void;
  enterRaceEventWithToad: (toadId: string) => void;
  eggResult: EggReveal | null;
  onClearEgg: () => void;
  claimDailyFlies: () => void;
  claimFliesSkip: () => void;
  claimReward: () => void;
  lastClaimResult: { claim: { status: string; netAmount: number; fliesGranted: number; txSignature: string | null; error: string | null; amount: number }; retry: boolean } | null;
  guestMode?: boolean;
  onConnectWallet?: () => void;
  kvOk: boolean | null;
  setNickname?: (name: string) => void;
}) {
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  useEffect(() => {
    if (typeof window !== "undefined" && !localStorage.getItem("howToPlayDismissed")) {
      setShowHowToPlay(true);
    }
  }, []);
  const dismissHowToPlay = () => {
    if (typeof window !== "undefined") localStorage.setItem("howToPlayDismissed", "1");
    setShowHowToPlay(false);
  };

  return (
    <>
      {showHowToPlay && <HowToPlayModal onClose={dismissHowToPlay} />}
      <main className="game-shell min-h-screen px-3 pb-24 pt-3 text-white sm:px-5 xl:pb-5">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-3">
        <TopHud player={player} gate={gate} guestMode={guestMode} onConnectWallet={onConnectWallet} onSetNickname={setNickname} />
        {kvOk === false && (
          <div className="pixel text-sm text-center rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-red-300">
            ⚠ No database — add KV_REST_API_URL + KV_REST_API_TOKEN to Vercel env vars (Upstash free tier)
          </div>
        )}
        <div className="flex gap-3">
          <TabNav activeTab={activeTab} onChange={setTab} />
          <div className="min-w-0 flex-1">
            {message && (
              <div className="pixel text-sm text-white/60 text-center rounded-xl border border-white/8 bg-white/4 px-3 py-2 mb-3">{message}</div>
            )}
            {activeTab === "play" && (
              <PlayTab
                player={player}
                busy={busy}
                gate={gate}
                season={season}
                leaderboard={leaderboard}
                goToFrogs={() => setTab("frogs")}
                claimDailyFlies={claimDailyFlies}
                claimFliesSkip={claimFliesSkip}
                claimReward={claimReward}
                lastClaimResult={lastClaimResult}
                showHelp={() => setShowHowToPlay(true)}
              />
            )}
            {activeTab === "frogs" && (
              <FrogsTab
                player={player}
                busy={busy}
                activateToad={activateToad}
                deactivateToad={deactivateToad}
                feedToad={feedToad}
                canFeed={!busy && player.flies >= 2}
              />
            )}
            {activeTab === "hatch" && (
              <HatchTab player={player} busy={busy} openEgg={openEgg} eggResult={eggResult} onClearEgg={onClearEgg} goToFrogs={() => setTab("frogs")} />
            )}
            {activeTab === "races" && (
              <RacesTab player={player} season={season} busy={busy} guestMode={guestMode} enterRaceEventWithToad={enterRaceEventWithToad} />
            )}
            {activeTab === "leaderboard" && <LeaderboardTab leaderboard={leaderboard} season={season} />}
            {activeTab === "seasons" && <SeasonsTab currentSeasonId={player.currentWeekId} />}
            {activeTab === "creator" && <CreatorTab dashboard={creatorDashboard} busy={busy} recordCreatorRewards={recordCreatorRewards} />}
          </div>
        </div>
      </div>
    </main>
    </>
  );
}

const GUEST_PLAYER: PlayerState = {
  wallet: "GUEST",
  initialized: true,
  tokenBalance: 0,
  flies: 10,
  toads: [],
  selectedToadId: null,
  totalRaces: 0,
  wins: 0,
  losses: 0,
  racePoints: 0,
  weeklyScore: 0,
  weeklyWins: 0,
  weeklyRaces: 0,
  currentWeekId: "",
  weeklyHistory: {},
  lastWeeklyClaimId: "",
  weeklyRewardClaims: [],
  totalXp: 0,
  gachaPulls: 0,
  lastDailyClaimDate: "",
  lastRewardClaimAt: 0,
  nextRewardClaimAt: 0,
  latestRewardClaimId: "",
  lastJumpSettledAt: 0,
  dailyJumpScore: 0,
  dailyJumpCount: 0,
  dailyJumpDay: "",
  seasonJumpScore: 0,
  seasonJumpCount: 0,
  lifetimeJumps: 0,
  lifetimeJumpScore: 0,
  lastActiveSeasonId: "",
  seasonHistory: {},
  lastVerifiedAt: 0,
  lastFlyClaimAt: 0,
  lastRaceWindowId: 0,
  lastRaceResult: null,
  raceHistory: [],
  nickname: "",
  lastAutoPaidDate: "",
  createdAt: 0,
  updatedAt: 0,
};

export default function Home() {
  const [walletInput, setWalletInput] = useState("");
  const [verifiedWallet, setVerifiedWallet] = useState("");
  const [guestMode, setGuestMode] = useState(false);
  const [gate, setGate] = useState<GateResult | null>(null);
  const [player, setPlayer] = useState<PlayerState | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [season, setSeason] = useState<SeasonStats | null>(null);
  const [creatorDashboard, setCreatorDashboard] = useState<CreatorDashboard | null>(null);
  const [activeTab, setActiveTab] = useState<GameTab>("play");
  const [busy, setBusy] = useState(false);
  const [busyAction, setBusyAction] = useState("");
  const [message, setMessage] = useState("");
  const [eggResult, setEggResult] = useState<EggReveal | null>(null);
  const [kvOk, setKvOk] = useState<boolean | null>(null);

  const tokenSymbol = gate?.symbol ?? TOAD_JUMP_TOKEN_SYMBOL;
const setTab = useCallback((tab: GameTab) => {
    setActiveTab(tab);
    setMessage("");
    window.history.replaceState(null, "", `#${tab}`);
  }, [setMessage]);

  const fetchMeta = useCallback(() => {
    fetch("/api/meta")
      .then((res) => res.json())
      .then((data) => {
        if (data.leaderboard) setLeaderboard(data.leaderboard);
        if (data.season) setSeason(data.season);
        if (data.creatorDashboard) setCreatorDashboard(data.creatorDashboard);
      })
      .catch(() => {});
  }, []);

  const silentSettle = useCallback(async () => {
    if (!verifiedWallet) return;
    try {
      const res = await fetch("/api/game/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "settle_jumps", wallet: verifiedWallet }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.playerData) setPlayer(data.playerData);
    } catch {}
  }, [verifiedWallet]);

  useEffect(() => {
    setActiveTab(normalizedHash());
    const onHashChange = () => setActiveTab(normalizedHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    fetchMeta();
    const id = window.setInterval(fetchMeta, 30_000);
    return () => window.clearInterval(id);
  }, [fetchMeta]);

  const hasActiveToads = player ? player.toads.some(t => t.active) : false;

  useEffect(() => {
    if (!hasActiveToads || !verifiedWallet) return;
    const id = setInterval(silentSettle, 30_000);
    return () => clearInterval(id);
  }, [hasActiveToads, verifiedWallet, silentSettle]);

  function onPlayAsGuest() {
    setGuestMode(true);
    setPlayer(GUEST_PLAYER);
    setTab("hatch");
    setMessage("Guest mode — connect a wallet to save progress.");
  }

  function exitGuestMode() {
    setGuestMode(false);
    setPlayer(null);
    setMessage("");
  }

  async function checkAccess() {
    const wallet = walletInput.trim();
    if (!wallet) {
      setMessage("Paste a Solana wallet address first.");
      return;
    }

    setBusy(true);
    setBusyAction("check");
    setMessage("");
    setEggResult(null);
    try {
      const balanceRes = await fetch(`/api/token/balance?wallet=${encodeURIComponent(wallet)}`);
      const gateData = (await balanceRes.json()) as GateResult;
      setGate(gateData);

      if (!balanceRes.ok || !gateData.wallet) {
        setPlayer(null);
        setVerifiedWallet("");
        setMessage(gateData.error ?? "Invalid wallet address.");
        return;
      }

      const initRes = await fetch("/api/game/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "init", wallet: gateData.wallet }),
      });
      const initData = await initRes.json();
      if (!initRes.ok) throw new Error(initData.error ?? "Unable to initialize player");
      setGuestMode(false);
      setVerifiedWallet(gateData.wallet);
      setPlayer(initData.playerData);
      if (typeof initData.kvOk === "boolean") setKvOk(initData.kvOk);
      fetchMeta();
      if ((initData.playerData as PlayerState)?.toads?.length === 0) {
        setTab("hatch");
      } else {
        setTab("play");
      }
      setMessage("Welcome to Toad Jump!");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Access check failed.");
    } finally {
      setBusy(false);
      setBusyAction("");
    }
  }

  function simulateGuestAction(action: string, extra: Record<string, unknown> = {}): { result: Record<string, unknown> } | null {
    if (!player) return null;
    const p: PlayerState = { ...player, toads: player.toads.map(t => ({ ...t })) };

    if (action === "open_egg") {
      if (p.flies < ACTION_COSTS.openEgg) { setMessage(`Need ${ACTION_COSTS.openEgg} flies to hatch!`); return null; }
      p.flies -= ACTION_COSTS.openEgg;
      const roll = Math.random() * 100;
      let cumulative = 0;
      let kind: ToadKind = "swamp";
      for (const entry of EGG_ODDS) { cumulative += entry.chance; if (roll < cumulative) { kind = entry.kind; break; } }
      const existing = p.toads.find(t => t.kind === kind);
      let eggReveal: EggReveal;
      if (existing) {
        const bonusFlies = kind === "shadow" ? 2 : 1;
        p.flies += bonusFlies;
        eggReveal = { toad: existing, isNew: false, bonusFlies };
      } else {
        const tmpl = TOAD_TEMPLATES[kind];
        const today = new Date().toISOString().slice(0, 10);
        const maxEnergy = TOAD_DAILY_ENERGY[kind];
        const newToad: Toad = {
          id: `guest-${kind}-${Date.now()}`,
          kind, name: tmpl.name, rarity: tmpl.rarity,
          speed: tmpl.speed, stamina: tmpl.stamina, luck: tmpl.luck, consistency: tmpl.consistency,
          xp: 0, level: 1, skin: "Classic", energy: maxEnergy, maxEnergy, lastEnergyRefillDate: today,
          jumps: 0, active: false, lastJumpAt: 0,
        };
        p.toads.push(newToad);
        p.selectedToadId = newToad.id;
        eggReveal = { toad: newToad, isNew: true, bonusFlies: 0 };
      }
      setPlayer(p);
      return { result: { egg: { toad: eggReveal.toad, isNew: eggReveal.isNew, bonusFlies: eggReveal.bonusFlies } } };
    }

    if (action === "activate_toad") {
      const toad = p.toads.find(t => t.id === extra.toadId);
      if (!toad) return null;
      toad.active = true;
      toad.lastJumpAt = Date.now();
      setPlayer(p);
      return { result: { activated: true, toadId: toad.id, toadName: toad.name } };
    }

    if (action === "deactivate_toad") {
      const toad = p.toads.find(t => t.id === extra.toadId);
      if (!toad) return null;
      toad.active = false;
      setPlayer(p);
      return { result: { deactivated: true, toadId: toad.id } };
    }

    return null;
  }

  async function sendAction(action: string, extra: Record<string, unknown> = {}) {
    if (guestMode) {
      const GUEST_ACTIONS = ["open_egg", "activate_toad", "deactivate_toad"];
      if (!GUEST_ACTIONS.includes(action)) {
        setMessage("Connect a wallet to unlock this feature.");
        return null;
      }
      return simulateGuestAction(action, extra);
    }
    if (!verifiedWallet) return null;
    setBusy(true);
    setBusyAction(action);
    setMessage("");
    try {
      const res = await fetch("/api/game/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, wallet: verifiedWallet, ...extra }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Action failed");
      setPlayer(data.playerData);
      if (data.gate) setGate(data.gate);
      if (typeof data.kvOk === "boolean") setKvOk(data.kvOk);
      fetchMeta();
      return data;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action failed.");
      return null;
    } finally {
      setBusy(false);
      setBusyAction("");
    }
  }

  async function claimDailyFlies() {
    const data = await sendAction("claim_daily_flies");
    if (data) setMessage("+5 flies claimed!");
  }

  async function claimFliesSkip() {
    const data = await sendAction("claim_flies_skip");
    if (data) setMessage("+5 flies!");
  }

  async function activateToad(toadId: string) {
    const data = await sendAction("activate_toad", { toadId });
    if (data) setMessage("Frog activated — jumping 24/7!");
  }

  async function deactivateToad(toadId: string) {
    const data = await sendAction("deactivate_toad", { toadId });
    if (data) setMessage("Frog paused.");
  }

  async function openEgg() {
    const data = await sendAction("open_egg");
    const egg = data?.result?.egg;
    if (egg) {
      setEggResult({ toad: egg.toad, isNew: egg.isNew, bonusFlies: egg.bonusFlies ?? 0 });
      setMessage(egg.isNew ? `New frog hatched: ${egg.toad.name}!` : `Duplicate ${egg.toad.name}: XP added.`);
    }
  }

  async function feedToad(toadId: string) {
    const data = await sendAction("feed_toad", { toadId });
    if (data?.result) {
      const r = data.result as { toadName: string; xpGained: number; leveled: boolean; level: number };
      setMessage(r.leveled
        ? `${r.toadName} leveled up to Lv ${r.level}!`
        : `Fed ${r.toadName}! +${r.xpGained} XP`);
    }
  }

  async function enterRaceEventWithToad(toadId: string) {
    const data = await sendAction("enter_race_event", { toadId });
    if (data) {
      const r = data.result;
      setMessage(`Entered race! ${r.entrantCount} competitor${r.entrantCount === 1 ? "" : "s"} so far.`);
    }
  }

  const [lastClaimResult, setLastClaimResult] = useState<{
    claim: { status: string; netAmount: number; fliesGranted: number; txSignature: string | null; error: string | null; amount: number };
    retry: boolean;
  } | null>(null);

  async function claimReward() {
    const data = await sendAction("claim_24h_reward");
    if (data?.result?.reward) {
      setLastClaimResult(data.result.reward);
      const claim = data.result.reward.claim;
      if (claim.txSignature) {
        setMessage(`+${shortNumber(claim.netAmount)} ${tokenSymbol} claimed on-chain!`);
      } else if (claim.fliesGranted > 0) {
        setMessage(`+${claim.fliesGranted} flies granted!`);
      }
    }
  }

  async function setNickname(name: string) {
    await sendAction("set_nickname", { nickname: name });
  }

  async function recordCreatorRewards(amount: number, key: string) {
    if (!Number.isFinite(amount) || amount <= 0) {
      setMessage("Enter a positive creator rewards amount.");
      return;
    }
    setBusy(true);
    setBusyAction("record_creator_rewards");
    setMessage("");
    try {
      const res = await fetch("/api/creator/rewards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, key }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Unable to record creator rewards");
      setCreatorDashboard((current) => current ? { ...current, ledger: data.ledger } : current);
      fetchMeta();
      setMessage(`Creator rewards recorded: ${shortNumber(amount)} ${tokenSymbol}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to record creator rewards.");
    } finally {
      setBusy(false);
      setBusyAction("");
    }
  }


  if (!player?.initialized) {
    return (
      <EntryScreen
        walletInput={walletInput}
        setWalletInput={setWalletInput}
        checkAccess={checkAccess}
        onPlayAsGuest={onPlayAsGuest}
        busy={busy}
        busyAction={busyAction}
        message={message}
        gate={gate}
        tokenSymbol={tokenSymbol}
      />
    );
  }

  return (
    <GameShell
      activeTab={activeTab}
      setTab={setTab}
      player={player}
      gate={gate}
      message={message}
      leaderboard={leaderboard}
      season={season}
      creatorDashboard={creatorDashboard}
      busy={busy}
      activateToad={activateToad}
      deactivateToad={deactivateToad}
      openEgg={openEgg}
      feedToad={feedToad}
      recordCreatorRewards={recordCreatorRewards}
      enterRaceEventWithToad={enterRaceEventWithToad}
      eggResult={eggResult}
      onClearEgg={() => setEggResult(null)}
      claimDailyFlies={claimDailyFlies}
      claimFliesSkip={claimFliesSkip}
      claimReward={claimReward}
      lastClaimResult={lastClaimResult}
      guestMode={guestMode}
      onConnectWallet={exitGuestMode}
      kvOk={kvOk}
      setNickname={setNickname}
    />
  );
}
