"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Coins, Egg, Flag, History, LayoutDashboard, Play, Trophy, Users } from "lucide-react";
import {
  ACTION_COSTS,
  RUNNING_TOADS_BUY_URL,
  RUNNING_TOADS_TOKEN_SYMBOL,
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



const gameTabs: Array<{ id: GameTab; label: string; Icon: typeof Play }> = [
  { id: "play",        label: "Play",        Icon: Play },
  { id: "frogs",       label: "Frogs",       Icon: Users },
  { id: "hatch",       label: "Hatch",       Icon: Egg },
  { id: "races",       label: "Races",       Icon: Flag },
  { id: "rewards",     label: "Rewards",     Icon: Coins },
  { id: "leaderboard", label: "Leaderboard", Icon: Trophy },
  { id: "seasons",     label: "Seasons",     Icon: History },
  { id: "creator",     label: "Creator",     Icon: LayoutDashboard },
];

const assetPaths = {
  logo: "/frogs/toad-jump-coin.png",
  raceGif: "/frogs/race-toad.gif",
  sourceToads: "/frogs/source-toads.png",
  egg: "/frogs/egg.png",
  fly: "/frogs/fly.png",
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

function ResourcePill({ label, value, tone = "lime" }: { label: string; value: string | number; tone?: "lime" | "sky" | "yellow" | "white" }) {
  const toneClass = {
    lime: "text-lime-100 border-lime-200/20 bg-lime-300/10",
    sky: "text-sky-100 border-sky-200/20 bg-sky-300/10",
    yellow: "text-yellow-100 border-yellow-200/20 bg-yellow-300/10",
    white: "text-white border-white/10 bg-white/5",
  }[tone];

  return (
    <div className={`hud-pill ${toneClass}`}>
      <div className="text-[10px] font-black uppercase tracking-[0.14em] text-white/45">{label}</div>
      <div className="mt-0.5 min-w-0 truncate font-mono text-sm font-black">{value}</div>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/24 px-3 py-2 text-center">
      <div className="text-[10px] font-black uppercase tracking-[0.14em] text-white/38">{label}</div>
      <div className="mt-1 font-mono text-base font-black text-lime-100">{value}</div>
    </div>
  );
}


function TabNav({ activeTab, onChange }: { activeTab: GameTab; onChange: (tab: GameTab) => void }) {
  return (
    <>
      <nav className="hidden w-24 shrink-0 flex-col gap-2 xl:flex">
        {gameTabs.map((tab) => (
          <button key={tab.id} onClick={() => onChange(tab.id)} className={`tab-button ${activeTab === tab.id ? "tab-button-active" : ""}`}>
            <span className="tab-icon"><tab.Icon size={16} strokeWidth={2.5} /></span>
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>
      <nav className="fixed inset-x-3 bottom-3 z-40 flex gap-2 overflow-x-auto rounded-2xl border border-lime-200/20 bg-emerald-950/94 p-2 shadow-2xl backdrop-blur xl:hidden">
        {gameTabs.map((tab) => (
          <button key={tab.id} onClick={() => onChange(tab.id)} className={`tab-button mobile-tab ${activeTab === tab.id ? "tab-button-active" : ""}`}>
            <span className="tab-icon"><tab.Icon size={14} strokeWidth={2.5} /></span>
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
  activeFrogs,
  message,
  guestMode,
  onConnectWallet,
}: {
  player: PlayerState;
  gate: GateResult | null;
  activeFrogs: number;
  message: string;
  guestMode?: boolean;
  onConnectWallet?: () => void;
}) {
  const balance = gate?.balance ?? player.tokenBalance;
  const boost = tokenBoost(balance);

  return (
    <header className="sticky top-0 z-30 game-panel p-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <FallbackImage
            src={assetPaths.logo}
            fallback={assetPaths.sourceToads}
            alt="RunningToads"
            className="h-14 w-24 shrink-0 rounded-lg border border-lime-200/20 bg-black/35 object-cover object-top"
          />
          <div className="min-w-0">
            <div className="text-xs font-black uppercase tracking-[0.24em] text-lime-200">RunningToads</div>
            <div className="truncate text-sm font-semibold text-emerald-50/70">{message || "Active jumping frogs share the daily pool."}</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:flex lg:min-w-0 lg:flex-wrap lg:justify-end">
          {guestMode ? (
            <button
              onClick={onConnectWallet}
              className="hud-pill border-amber-200/30 bg-amber-300/15 text-amber-200 hover:bg-amber-300/25 transition-colors cursor-pointer col-span-2 sm:col-span-3"
            >
              <div className="text-[10px] font-black uppercase tracking-[0.14em] text-amber-200/70">Guest mode</div>
              <div className="mt-0.5 text-sm font-black">🔗 Connect wallet to save progress</div>
            </button>
          ) : (
            <>
              <ResourcePill label="Wallet" value={formatWallet(player.wallet)} tone="white" />
              <ResourcePill label="Flies" value={player.flies} tone="lime" />
              <ResourcePill label="Tokens" value={shortNumber(balance)} tone="yellow" />
              <ResourcePill label="Jumping" value={activeFrogs} tone="sky" />
              <ResourcePill label="Score" value={player.weeklyScore} tone="yellow" />
              <div className="hud-pill border-yellow-200/20 bg-yellow-300/10 text-yellow-100">
                <div className="text-[10px] font-black uppercase tracking-[0.14em] text-white/45">Boost</div>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <span className={boost.cls}>{boost.mult} {boost.label}</span>
                </div>
              </div>
            </>
          )}
        </div>
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
  return (
    <main
      className="relative min-h-screen text-white flex flex-col items-center justify-center px-4"
      style={{ backgroundImage: `url(${assetPaths.forest})`, backgroundSize: "cover", backgroundPosition: "center" }}
    >
      <div className="absolute inset-0 bg-black/58" />

      <div className="relative z-10 flex w-full max-w-md flex-col items-center gap-8">
        {/* Logo + wordmark */}
        <div className="flex flex-col items-center gap-3">
          <FallbackImage
            src={assetPaths.logo}
            fallback={assetPaths.sourceToads}
            alt="RunningToads"
            className="h-24 w-24 rounded-2xl border border-lime-200/30 bg-black/40 object-cover shadow-[0_0_60px_rgba(190,242,100,0.3)]"
          />
          <h1 className="text-5xl font-black tracking-tight text-lime-50 drop-shadow-[0_4px_24px_rgba(0,0,0,0.7)]">
            RunningToads
          </h1>
          <p className="text-sm font-semibold text-white/55">Earn tokens. Race frogs.</p>
        </div>

        {/* CTA card */}
        <div className="w-full rounded-2xl border border-white/14 bg-black/40 p-5 backdrop-blur-md">
          <input
            value={walletInput}
            onChange={(event) => setWalletInput(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && checkAccess()}
            placeholder="Paste Solana wallet address"
            className="w-full rounded-xl border border-white/12 bg-white/8 px-4 py-3.5 text-sm text-white outline-none placeholder:text-white/35 focus:border-lime-300/60"
          />
          {message && (
            <div className="mt-2 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-white/65" aria-live="polite">
              {message}
            </div>
          )}
          <div className="mt-3 grid grid-cols-2 gap-3">
            <button
              onClick={checkAccess}
              disabled={busy}
              className="rounded-xl bg-lime-300 py-4 text-sm font-black text-emerald-950 shadow-[0_10px_30px_rgba(190,242,100,0.28)] hover:bg-lime-200 active:scale-95 transition-all disabled:opacity-50"
            >
              {busyAction === "check" ? "Loading..." : "▶ Connect Wallet"}
            </button>
            <button
              onClick={onPlayAsGuest}
              disabled={busy}
              className="rounded-xl border border-white/16 bg-white/8 py-4 text-sm font-black text-white/80 hover:bg-white/14 active:scale-95 transition-all disabled:opacity-50"
            >
              👁 Play as Guest
            </button>
          </div>
          {gate && gate.balance !== undefined && (
            <div className="mt-3 text-center text-xs text-white/45">
              Balance: {shortNumber(gate.balance)} {gate.symbol}
            </div>
          )}
        </div>

        {/* Boost tiers collapsed */}
        <details className="w-full">
          <summary className="cursor-pointer text-center text-xs font-black uppercase tracking-[0.16em] text-white/30 hover:text-white/50 transition-colors">
            Token boost tiers ↓
          </summary>
          <div className="mt-3 space-y-1.5">
            {[
              { icon: "⚪", mult: "1×",   label: "No boost",  req: "0 tokens"       },
              { icon: "🟢", mult: "1.2×", label: "Holder",    req: "1+ tokens"      },
              { icon: "🔵", mult: "1.5×", label: "Stacker",   req: "100+ tokens"    },
              { icon: "🟣", mult: "2×",   label: "Whale",     req: "1,000+ tokens"  },
              { icon: "🟡", mult: "3×",   label: "Legend",    req: "10,000+ tokens" },
            ].map((tier) => (
              <div key={tier.mult} className="flex items-center justify-between rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-white/60">
                <span className="flex items-center gap-2">
                  <span>{tier.icon}</span>
                  <span className="font-bold">{tier.mult}</span>
                  <span className="text-white/38">{tier.label}</span>
                </span>
                <span className="font-mono text-white/35">{tier.req}</span>
              </div>
            ))}
          </div>
        </details>

        <a
          href={RUNNING_TOADS_BUY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-black uppercase tracking-[0.14em] text-lime-200/55 hover:text-lime-200/80 transition-colors"
        >
          Buy {tokenSymbol} to boost →
        </a>
      </div>
    </main>
  );
}

const JUMP_SPEED_MULT: Record<ToadKind, number> = {
  swamp: 1, poison: 1.35, crystal: 0.9, shadow: 1, emperor: 1.65,
};

function toadEarningInfo(toad: Toad) {
  const scorePerJump = Math.round(
    (toad.speed * 0.34 + toad.stamina * 0.22 + toad.luck * 0.22 + toad.consistency * 0.22) *
    toad.level * 0.8
  );
  const intervalMin = Math.round(12 / JUMP_SPEED_MULT[toad.kind]);
  const ptsPerHour = Math.round(scorePerJump * (60 / intervalMin));
  const sprintFlies = toad.kind === "shadow" && Math.random() < 0.35 ? 3 : 2;
  return { scorePerJump, intervalMin, ptsPerHour, sprintFlies };
}

function FlyClaimStrip({
  player,
  balance,
  busy,
  claimDailyFlies,
  claimFliesSkip,
}: {
  player: PlayerState;
  balance: number;
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
    <div className="flex items-center justify-between rounded-xl border border-lime-200/18 bg-lime-300/7 px-4 py-3">
      <div>
        <div className="text-xs font-black text-lime-200">Flies</div>
        <div className="text-[10px] text-white/38">
          {onCooldown
            ? `Next free claim in ${mins}:${String(secs).padStart(2, "0")}`
            : "+5 flies ready to claim"}
        </div>
      </div>
      <div className="flex gap-2">
        {onCooldown && balance >= 1 && (
          <button
            onClick={claimFliesSkip}
            disabled={busy}
            className="rounded-lg border border-yellow-200/30 bg-yellow-300/10 px-3 py-1.5 text-xs font-black text-yellow-200 hover:bg-yellow-300/20 active:scale-95 transition-all disabled:opacity-40"
          >
            🪙 Token Skip
          </button>
        )}
        <button
          onClick={claimDailyFlies}
          disabled={busy || onCooldown}
          className="rounded-lg bg-lime-300 px-4 py-1.5 text-xs font-black text-emerald-950 hover:bg-lime-200 active:scale-95 transition-all disabled:opacity-40"
        >
          {onCooldown ? "✓ Done" : "Claim +5 🪰"}
        </button>
      </div>
    </div>
  );
}

const RARITY_CYCLE_MS: Record<string, number> = {
  Common:    15_000,
  Uncommon:  10_000,
  Rare:       5_000,
  Epic:       3_000,
  Legendary:  1_000,
};

// Bar cycles at rarity speed, counter goes +1 on each hop
function LiveJumpProgress({ toad, balance: _balance }: { toad: Toad; balance: number }) {
  const [hops, setHops] = useState(0);
  const [pct, setPct] = useState(0);

  useEffect(() => {
    const CYCLE = RARITY_CYCLE_MS[toad.rarity] ?? 5_000;
    const start = Date.now();

    const id = setInterval(() => {
      const elapsed = Date.now() - start;
      const cycle = Math.floor(elapsed / CYCLE);
      const progress = ((elapsed % CYCLE) / CYCLE) * 100;
      setHops(cycle);
      setPct(progress);
    }, 50);

    return () => clearInterval(id);
  }, [toad.rarity]);

  return (
    <div className="mt-3 space-y-1.5">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-lime-300"
          style={{ width: `${pct}%`, transition: pct < 2 ? "none" : "width 50ms linear" }}
        />
      </div>
    </div>
  );
}

// Hops at rarity speed: 0.8s animated, then rests until next cycle
function ToadSprite({ toad, className }: { toad: Toad; className: string }) {
  const [jumping, setJumping] = useState(true);
  const gifSrc = assetPaths.toadGifs[toad.kind];

  useEffect(() => {
    const cycle = RARITY_CYCLE_MS[toad.rarity] ?? 5_000;
    function hop() {
      setJumping(true);
      setTimeout(() => setJumping(false), 800);
    }
    hop();
    const id = setInterval(hop, cycle);
    return () => clearInterval(id);
  }, [toad.rarity]);

  if (gifSrc) {
    return <img src={gifSrc} alt={toad.name} className={`${className} block object-contain`} />;
  }

  if (jumping) {
    return <SpriteSheet src={assetPaths.toadSheets[toad.kind]} alt={toad.name} className={className} />;
  }
  return (
    <img src={assetPaths.toads[toad.kind]} alt={toad.name} className={`${className} object-contain`} />
  );
}

function PlayTab({
  player,
  busy,
  gate,
  goToFrogs,
  claimDailyFlies,
  claimFliesSkip,
}: {
  player: PlayerState;
  busy: boolean;
  gate: GateResult | null;
  goToFrogs: () => void;
  claimDailyFlies: () => void;
  claimFliesSkip: () => void;
}) {
  const activeToads = player.toads.filter(t => t.active);
  const balance = gate?.balance ?? player.tokenBalance;

  return (
    <section className="space-y-3">

      {/* Stats strip */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatBox label="Today's score"  value={shortNumber(player.dailyJumpScore)} />
        <StatBox label="Season score"   value={shortNumber(player.seasonJumpScore)} />
        <StatBox label="All-time jumps" value={shortNumber(player.lifetimeJumps)} />
        <StatBox label="Jumping now"    value={activeToads.length} />
      </div>

      {/* Fly claim strip */}
      <FlyClaimStrip player={player} balance={balance} busy={busy} claimDailyFlies={claimDailyFlies} claimFliesSkip={claimFliesSkip} />

      {/* Active frogs */}
      {activeToads.length > 0 ? (
        <div className="space-y-3">
          {activeToads.map(toad => {
            const { scorePerJump, intervalMin, ptsPerHour } = toadEarningInfo(toad);
            return (
              <div
                key={toad.id}
                className={`relative flex items-stretch overflow-hidden rounded-2xl border border-l-4 ${toadTone[toad.kind]} ${toadAccent[toad.kind]}`}
              >
                {/* Sprite */}
                <div className="relative shrink-0 flex items-center justify-center">
                  <div className="absolute inset-3 rounded-full bg-lime-300/10 animate-pulse" />
                  <ToadSprite toad={toad} className="relative z-10 h-56 w-56" />
                  <span className="absolute left-2 top-2 z-20 rounded-full bg-black/50 px-2 py-0.5 text-[9px] font-black text-white/80 backdrop-blur-sm">
                    Lv {toad.level}
                  </span>
                </div>

                {/* Info */}
                <div className="flex flex-1 flex-col gap-3 px-6 py-5">
                  {/* Name + rarity */}
                  <div className="flex items-center gap-2">
                    <span className="text-xl font-black text-white">{toad.name}</span>
                    <span className="rounded-full border border-white/15 bg-white/8 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white/50">
                      {toad.rarity}
                    </span>
                  </div>

                  {/* 2-col metrics */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-5xl font-black leading-none text-lime-300">{shortNumber(ptsPerHour)}</div>
                      <div className="mt-1 text-[11px] font-black uppercase tracking-wider text-white/38">pts / hr</div>
                    </div>
                    <div>
                      <div className="text-5xl font-black leading-none text-sky-300">{shortNumber(toad.jumps ?? 0)}</div>
                      <div className="mt-1 text-[11px] font-black uppercase tracking-wider text-white/38">jumps all time</div>
                    </div>
                  </div>

                  {/* Secondary */}
                  <div className="text-xs text-white/30">
                    ~{scorePerJump} pts &nbsp;·&nbsp; every {intervalMin} min
                  </div>

                  {/* Progress */}
                  <LiveJumpProgress toad={toad} balance={balance} />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="game-panel flex flex-col items-center gap-3 py-12 text-center">
          <div className="text-6xl">😴</div>
          <div className="text-sm font-black text-white/40">No frogs jumping yet</div>
          <button
            onClick={goToFrogs}
            className="rounded-lg bg-lime-300/15 px-4 py-2 text-xs font-black text-lime-200 transition-colors hover:bg-lime-300/25"
          >
            Go to Frogs →
          </button>
        </div>
      )}

    </section>
  );
}

function racePotential(toad: Toad): { luckPts: number; levelPts: number; statPts: number; total: number } {
  const luckPts  = Math.round((toad.luck / 100) * 15);
  const levelPts = Math.round(Math.min((toad.level - 1) * 1.0, 12));
  const statPts  = Math.round(toad.speed * 0.025 + toad.stamina * 0.02 + toad.consistency * 0.015);
  return { luckPts, levelPts, statPts, total: luckPts + levelPts + statPts };
}

const raritySpecialty: Partial<Record<string, string>> = {
  shadow:  "Shadow's high luck = biggest upset potential 🌑",
  emperor: "Emperor has the highest ceiling — but never a sure thing 👑",
  crystal: "Crystal's stamina gives a reliable stat floor 💎",
  poison:  "Poison's speed adds a small stat edge 🐸",
};

function FrogPickerCard({ toad, selected, onSelect }: { toad: Toad; selected: boolean; onSelect: () => void }) {
  const pot = racePotential(toad);
  const ringClass = selected
    ? `ring-2 ring-lime-300 ${toadTone[toad.kind]} opacity-100`
    : `${toadTone[toad.kind]} opacity-60 hover:opacity-90`;
  return (
    <button
      onClick={onSelect}
      className={`flex shrink-0 flex-col items-center gap-1.5 rounded-2xl border p-3 transition-all ${ringClass} w-28`}
    >
      <img src={assetPaths.toads[toad.kind]} alt={toad.name} className="h-16 w-16 object-contain" />
      <div className="text-center">
        <div className="text-xs font-black text-white truncate max-w-full">{toad.name}</div>
        <div className="text-[9px] text-white/45 truncate">{toad.rarity} · Lv {toad.level}</div>
        <div className="mt-1 font-mono text-sm font-black text-yellow-300">⚡{pot.total}</div>
      </div>
    </button>
  );
}

function RacePotentialPanel({ toad }: { toad: Toad }) {
  const { luckPts, levelPts, statPts, total } = racePotential(toad);
  const MAX_REF = 39; // Emperor Lv13 max potential
  const bars = [
    { label: "Luck ceiling", value: luckPts, max: MAX_REF, color: "bg-yellow-400" },
    { label: "Level edge",   value: levelPts, max: MAX_REF, color: "bg-lime-400" },
    { label: "Stat floor",   value: statPts,  max: MAX_REF, color: "bg-sky-400" },
  ];
  const scoreFloor = Math.round(statPts + levelPts);
  const scoreCeiling = Math.round(75 + total);
  const specialty = raritySpecialty[toad.kind];

  return (
    <div className="rounded-2xl border border-white/10 bg-black/24 p-4">
      <div className="flex items-baseline gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.14em] text-white/38">Race Potential</div>
          <div className="font-mono text-4xl font-black text-yellow-300">{total}</div>
        </div>
        <div className="text-[10px] text-white/30 leading-relaxed">
          Score range<br />~{scoreFloor}–{scoreCeiling}
        </div>
      </div>
      <div className="mt-3 space-y-2">
        {bars.map(b => (
          <div key={b.label} className="flex items-center gap-2">
            <span className="w-20 shrink-0 text-[9px] font-black uppercase tracking-wide text-white/35">{b.label}</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/8">
              <div className={`h-full rounded-full ${b.color}`} style={{ width: `${Math.min(100, Math.round((b.value / b.max) * 100))}%` }} />
            </div>
            <span className="w-5 shrink-0 text-right text-[9px] font-black text-white/50">+{b.value}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-lg border border-yellow-200/14 bg-yellow-300/6 px-3 py-2 text-center text-[10px] text-yellow-100/60">
        🎲 75% of your score is pure luck — any frog can win!
      </div>
      {specialty && (
        <div className="mt-2 text-center text-[10px] text-white/38">{specialty}</div>
      )}
    </div>
  );
}

function RacesTab({
  player,
  season,
  busy,
  enterRaceEventWithToad,
}: {
  player: PlayerState;
  season: SeasonStats | null;
  busy: boolean;
  enterRaceEventWithToad: (toadId: string) => void;
}) {
  const [now, setNow] = useState(Date.now());
  const [selectedToadId, setSelectedToadId] = useState<string | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Auto-select active toad as default
  useEffect(() => {
    if (!selectedToadId && player.toads.length > 0) {
      const active = player.toads.find(t => t.active) ?? player.toads[0];
      setSelectedToadId(active.id);
    }
  }, [player.toads, selectedToadId]);

  const windowId = Math.floor(now / 1_800_000);
  const endsAt = (windowId + 1) * 1_800_000;
  const remaining = endsAt - now;
  const mins = Math.floor(remaining / 60_000);
  const secs = Math.floor((remaining % 60_000) / 1000);
  const isClosing = remaining < 60_000;

  const selectedToad = player.toads.find(t => t.id === selectedToadId) ?? null;
  const alreadyEntered = player.lastRaceWindowId === windowId;
  const realEntrantCount = alreadyEntered ? 1 : 0; // approximate — server tracks actual count
  const npcSlots = Math.max(0, 4 - realEntrantCount - 1);

  const racePool = season?.projectLedger.racePool ?? 0;
  const result = player.lastRaceResult;

  const enterButtonLabel = () => {
    if (busy) return "Entering...";
    if (alreadyEntered) return "Entered ✓ — waiting for race close";
    if (isClosing) return "Race closing — next window soon";
    if (!selectedToad) return "Pick a frog above";
    if (player.flies < 2) return "Need 2 🪰 flies to enter";
    return "Enter Race · 2 🪰";
  };
  const canEnter = !busy && !alreadyEntered && !isClosing && !!selectedToad && player.flies >= 2;
  const enterButtonStyle = alreadyEntered
    ? "bg-emerald-600/30 text-emerald-200 border border-emerald-400/20"
    : isClosing
    ? "bg-amber-300/15 text-amber-200 border border-amber-300/20"
    : canEnter
    ? "bg-lime-300 text-emerald-950 shadow-[0_0_30px_rgba(190,242,100,0.25)] hover:bg-lime-200 active:scale-95"
    : "bg-white/8 text-white/30 border border-white/10";

  const rankBorder = (rank: number) =>
    rank === 1 ? "border-yellow-300/40 bg-yellow-300/10" :
    rank === 2 ? "border-white/25 bg-white/8" :
    rank === 3 ? "border-amber-400/30 bg-amber-300/8" :
    "border-white/10 bg-white/4";

  return (
    <section className="space-y-3">

      {/* Zone 1 — Race window header */}
      <div className="game-panel p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-white/35">Race closes in</div>
            <div className={`font-mono text-5xl font-black leading-none ${isClosing ? "animate-pulse text-red-400" : "text-lime-300"}`}>
              {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="rounded-xl border border-yellow-200/20 bg-yellow-300/8 px-3 py-2 text-center">
              <div className="font-mono text-xl font-black text-yellow-200">{shortNumber(racePool)}</div>
              <div className="text-[9px] font-black uppercase tracking-wide text-yellow-200/45">Prize pool</div>
            </div>
            <div className="rounded-xl border border-lime-200/18 bg-lime-300/8 px-3 py-2 text-center">
              <div className="font-mono text-xl font-black text-lime-200">{realEntrantCount} real · {npcSlots} NPC</div>
              <div className="text-[9px] font-black uppercase tracking-wide text-lime-200/45">Slots</div>
            </div>
          </div>
        </div>
        <div className="mt-2 text-xs text-white/30">Every 30 min — top 3 win tokens · NPC prizes roll back to pool</div>
      </div>

      {/* Zone 2 — Frog picker */}
      <div className="game-panel p-4">
        <div className="text-xs font-black uppercase tracking-[0.16em] text-white/40 mb-3">Pick your racer</div>
        {player.toads.length > 0 ? (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {player.toads.map(toad => (
              <FrogPickerCard
                key={toad.id}
                toad={toad}
                selected={toad.id === selectedToadId}
                onSelect={() => setSelectedToadId(toad.id)}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <div className="text-4xl">🥚</div>
            <div className="text-sm font-black text-white/40">No frogs yet — go hatch one first!</div>
          </div>
        )}
      </div>

      {/* Zone 3 — Race Potential panel */}
      {selectedToad && <RacePotentialPanel toad={selectedToad} />}

      {/* Zone 4 — Enter button */}
      <button
        onClick={() => selectedToad && enterRaceEventWithToad(selectedToad.id)}
        disabled={!canEnter || busy}
        className={`w-full rounded-xl py-4 text-base font-black transition-all disabled:opacity-50 ${enterButtonStyle}`}
      >
        {enterButtonLabel()}
      </button>

      {/* Prize structure */}
      <div className="game-panel p-4">
        <div className="grid grid-cols-3 gap-2">
          {[
            { medal: "🥇", label: "1st place", share: "40%" },
            { medal: "🥈", label: "2nd place", share: "25%" },
            { medal: "🥉", label: "3rd place", share: "15%" },
          ].map(t => (
            <div key={t.label} className="rounded-xl border border-yellow-200/14 bg-yellow-300/6 p-2.5 text-center">
              <div className="text-xl">{t.medal}</div>
              <div className="mt-1 font-mono text-lg font-black text-yellow-200">{t.share}</div>
              <div className="text-[9px] text-yellow-100/40">of pool</div>
            </div>
          ))}
        </div>
        <div className="mt-2 text-center text-[10px] text-white/30">Rank 4+ get 2 🪰 flies · NPC wins roll back to pool</div>
      </div>

      {/* Zone 5 — Last result with full standings */}
      {result && (
        <div className="game-panel p-4">
          <div className="text-xs font-black uppercase tracking-[0.16em] text-white/40 mb-3">Last race result</div>

          {/* Player result boxes */}
          <div className="grid grid-cols-3 gap-2">
            <div className={`rounded-xl border p-3 text-center ${rankBorder(result.rank)}`}>
              <div className={`font-mono text-3xl font-black ${result.rank === 1 ? "text-yellow-300" : result.rank <= 3 ? "text-white" : "text-white/60"}`}>
                #{result.rank}
              </div>
              <div className="mt-0.5 text-[9px] font-black uppercase tracking-wide text-white/35">Rank</div>
            </div>
            <div className="rounded-xl border border-lime-200/16 bg-lime-300/6 p-3 text-center">
              <div className="font-mono text-3xl font-black text-lime-200">{shortNumber(result.score)}</div>
              <div className="mt-0.5 text-[9px] font-black uppercase tracking-wide text-lime-200/45">Score</div>
            </div>
            <div className="rounded-xl border border-yellow-200/16 bg-yellow-300/6 p-3 text-center">
              <div className="font-mono text-2xl font-black text-yellow-200">
                {result.tokensAwarded > 0 ? shortNumber(result.tokensAwarded) : `+${result.fliesAwarded} 🪰`}
              </div>
              <div className="mt-0.5 text-[9px] font-black uppercase tracking-wide text-yellow-200/45">
                {result.tokensAwarded > 0 ? "Tokens" : "Flies"}
              </div>
            </div>
          </div>

          {result.toadName && (
            <div className="mt-2 text-center text-[10px] text-white/35">
              Raced with <span className="font-bold text-white/55">{result.toadName}</span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function FrogsTab({
  player,
  busy,
  activateToad,
  deactivateToad,
  sprintWithToad,
  canSprint,
}: {
  player: PlayerState;
  busy: boolean;
  activateToad: (id: string) => void;
  deactivateToad: (id: string) => void;
  sprintWithToad: (id: string) => void;
  canSprint: boolean;
}) {
  const statBarColor: Record<string, string> = {
    SPD: "bg-sky-400",
    STA: "bg-lime-400",
    LCK: "bg-yellow-400",
    CON: "bg-purple-400",
  };

  return (
    <section className="grid grid-cols-2 gap-3">
      {player.toads.map(toad => {
        const xpNeeded = toad.level * 25;
        const xpPct = Math.min(100, Math.round((toad.xp / xpNeeded) * 100));
        const stats: [string, number][] = [
          ["SPD", toad.speed],
          ["STA", toad.stamina],
          ["LCK", toad.luck],
          ["CON", toad.consistency],
        ];
        return (
          <div
            key={toad.id}
            className={`flex flex-col overflow-hidden rounded-2xl border transition-all ${toadTone[toad.kind]}`}
          >
            {/* Image area */}
            <div className="relative flex items-center justify-center py-4">
              <img
                src={assetPaths.toads[toad.kind]}
                alt={toad.name}
                className={`h-28 w-28 object-contain transition-all duration-300 ${toad.active ? "" : "grayscale opacity-45"}`}
              />
              <span className="absolute left-2 top-2 rounded-full bg-black/50 px-2 py-0.5 text-[9px] font-black text-white/70 backdrop-blur-sm">
                Lv {toad.level}
              </span>
              {toad.active && (
                <span className="absolute bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-lime-300 px-2 py-0.5 text-[8px] font-black text-emerald-950">
                  ⚡ Active
                </span>
              )}
            </div>

            {/* Info */}
            <div className="flex flex-1 flex-col gap-2.5 px-3 pb-3">
              <div>
                <div className="truncate text-sm font-black text-white">{toad.name}</div>
                <div className="mt-0.5 text-[10px] text-white/45">{toad.rarity}</div>
              </div>

              {/* XP */}
              <div>
                <div className="mb-1 flex justify-between text-[9px] text-white/35">
                  <span>XP {toad.xp}/{xpNeeded}</span>
                  <span>→ {toad.level + 1}</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-lime-300 transition-all" style={{ width: `${xpPct}%` }} />
                </div>
              </div>

              {/* Stats */}
              <div className="space-y-1.5">
                {stats.map(([k, v]) => (
                  <div key={k} className="flex items-center gap-2">
                    <span className="w-6 shrink-0 text-[9px] font-black text-white/35">{k}</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/8">
                      <div className={`h-full rounded-full ${statBarColor[k]}`} style={{ width: `${Math.min(100, v)}%` }} />
                    </div>
                    <span className="w-5 shrink-0 text-right text-[9px] font-black text-white/55">{v}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 border-t border-white/8 px-3 py-2.5">
              <button
                onClick={() => toad.active ? deactivateToad(toad.id) : activateToad(toad.id)}
                disabled={busy}
                className={`flex-1 rounded-lg py-2 text-[10px] font-black uppercase tracking-[0.1em] transition-all disabled:opacity-50 ${
                  toad.active
                    ? "bg-lime-300/20 text-lime-200 hover:bg-lime-300/30"
                    : "bg-white/6 text-white/45 hover:bg-white/12"
                }`}
              >
                {toad.active ? "⏸ Pause" : "Activate"}
              </button>
              <button
                onClick={() => sprintWithToad(toad.id)}
                disabled={!canSprint}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-lime-300 text-base text-emerald-950 shadow-[0_0_14px_rgba(190,242,100,0.4)] hover:bg-lime-200 active:scale-90 disabled:opacity-35 transition-all"
              >
                🪰
              </button>
            </div>
          </div>
        );
      })}
      {player.toads.length === 0 && (
        <div className="col-span-2 game-panel flex flex-col items-center gap-3 py-12 text-center">
          <div className="text-6xl">🥚</div>
          <div className="text-sm font-black text-white/40">No frogs yet — go hatch one!</div>
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

  return (
    <section className="game-panel relative overflow-hidden">
      <div className="absolute inset-0 opacity-15" style={{ backgroundImage: `url(${assetPaths.forest})`, backgroundSize: "cover", backgroundPosition: "center" }} />
      <div className="relative z-10 flex min-h-[560px] flex-col items-center justify-center gap-6 px-4 py-10 text-center">

        {phase === "idle" && (
          <>
            <div className="flex h-64 w-64 items-center justify-center text-[120px] drop-shadow-[0_30px_28px_rgba(0,0,0,0.5)]">
              🥚
            </div>
            <div>
              <h2 className="text-4xl font-black text-white">Open a Toad Egg</h2>
              <p className="mt-2 text-sm text-white/50">Hatch frogs, duplicate XP, or small fly returns.</p>
            </div>
            <button
              onClick={handleOpen}
              disabled={busy || player.flies < ACTION_COSTS.openEgg}
              className="rounded-2xl bg-amber-300 px-10 py-4 text-base font-black text-emerald-950 shadow-[0_0_40px_rgba(251,191,36,0.3)] hover:bg-amber-200 active:scale-95 transition-all disabled:opacity-40"
            >
              Open Egg · {ACTION_COSTS.openEgg} 🪰
            </button>
            <div className="flex flex-wrap justify-center gap-2">
              {[
                ["Swamp Toad",     "58%",  "bg-lime-300/15   border-lime-200/30   text-lime-100"],
                ["Poison Dart",    "20%",  "bg-sky-300/15    border-sky-200/30    text-sky-100"],
                ["Crystal Frog",   "14%",  "bg-cyan-300/15   border-cyan-200/30   text-cyan-100"],
                ["Shadow Toad",    "6%",   "bg-purple-300/15 border-purple-200/30 text-purple-100"],
                ["Golden Emperor", "2%",   "bg-yellow-300/15 border-yellow-200/30 text-yellow-100"],
                ["Void Ancient",   "V2 ✦", "bg-rose-300/15   border-rose-200/30   text-rose-100"],
              ].map(([name, chance, cls]) => (
                <div key={name} className={`rounded-full border px-4 py-1.5 text-xs font-black ${cls}`}>
                  {name} <span className="opacity-55">·</span> {chance}
                </div>
              ))}
            </div>
          </>
        )}

        {phase === "opening" && (
          <>
            <div className="egg-opening flex h-64 w-64 items-center justify-center text-[120px] drop-shadow-[0_30px_28px_rgba(0,0,0,0.5)]">
              🥚
            </div>
            <div className="animate-pulse text-lg font-black text-white/60">Opening...</div>
          </>
        )}

        {phase === "revealed" && eggResult && (
          <>
            <div className="frog-reveal">
              <img
                src={assetPaths.toads[eggResult.toad.kind]}
                alt={eggResult.toad.name}
                className="mx-auto h-60 w-60 object-contain"
                style={{ filter: rarityGlowFilter[eggResult.toad.rarity] ?? "none" }}
              />
            </div>
            <div>
              {eggResult.isNew ? (
                <div className="mb-1 text-2xl font-black text-lime-300">✨ NEW FROG!</div>
              ) : (
                <div className="mb-1 text-2xl font-black text-white/50">Duplicate</div>
              )}
              <div className="text-3xl font-black text-white">{eggResult.toad.name}</div>
              <div className="mt-2 flex justify-center">
                <span className="rounded-full border border-white/15 bg-white/8 px-3 py-1 text-xs font-black uppercase tracking-wider text-white/60">
                  {eggResult.toad.rarity}
                </span>
              </div>
              {!eggResult.isNew && (
                <div className="mt-3 text-sm text-white/50">+XP gained &nbsp;·&nbsp; +{eggResult.bonusFlies} 🪰 returned</div>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleClear}
                disabled={busy}
                className="rounded-xl bg-amber-300 px-7 py-3 text-sm font-black text-emerald-950 hover:bg-amber-200 active:scale-95 transition-all disabled:opacity-40"
              >
                Open Another
              </button>
              <button
                onClick={() => { handleClear(); goToFrogs(); }}
                className="rounded-xl border border-white/15 bg-white/8 px-7 py-3 text-sm font-black text-white/70 hover:bg-white/14 transition-colors"
              >
                Go to Frogs →
              </button>
            </div>
          </>
        )}

      </div>
    </section>
  );
}

function RewardsTab({ season, player }: { season: SeasonStats | null; player: PlayerState }) {
  const totalDailyScore = season?.dailyJumpScore ?? 0;
  const playerShare = totalDailyScore > 0 ? player.dailyJumpScore / totalDailyScore : 0;
  const dailyPool = season?.projectLedger.dailyActivePool ?? 0;
  const totalPaid = season?.rewardLedger?.totalTokenRewardsPaid ?? 0;

  return (
    <section className="space-y-3">
      <div className="game-panel p-5">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="text-5xl">💧</div>
          <div>
            <div className="text-xs font-black uppercase tracking-[0.18em] text-lime-200/60">Auto-distribution</div>
            <h2 className="mt-1 text-2xl font-black text-white">Tokens flow to active jumpers</h2>
            <p className="mx-auto mt-2 max-w-lg text-sm text-white/55">
              Every 24h, 100% of Pump.fun creator rewards distribute proportionally to all wallets with active jumping frogs. No claiming required — keep frogs jumping to earn.
            </p>
          </div>
        </div>
        {player.dailyJumpScore > 0 && (
          <div className="mt-5 grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-lime-200/20 bg-lime-300/10 p-3 text-center">
              <div className="text-[10px] font-black uppercase tracking-[0.12em] text-lime-100/55">Your daily score</div>
              <div className="mt-1 font-mono text-xl font-black text-lime-100">{shortNumber(player.dailyJumpScore)}</div>
            </div>
            <div className="rounded-xl border border-lime-200/20 bg-lime-300/10 p-3 text-center">
              <div className="text-[10px] font-black uppercase tracking-[0.12em] text-lime-100/55">Your pool share</div>
              <div className="mt-1 font-mono text-xl font-black text-lime-100">{(playerShare * 100).toFixed(2)}%</div>
            </div>
            <div className="rounded-xl border border-lime-200/20 bg-lime-300/10 p-3 text-center">
              <div className="text-[10px] font-black uppercase tracking-[0.12em] text-lime-100/55">Est. daily earn</div>
              <div className="mt-1 font-mono text-xl font-black text-lime-100">{shortNumber(dailyPool * playerShare)}</div>
            </div>
          </div>
        )}
      </div>

      <div className="game-panel p-4">
        <div className="text-center">
          <div className="text-xs font-black uppercase tracking-[0.18em] text-white/40">Treasury</div>
          <h3 className="mt-1 text-2xl font-black text-white">Live pools</h3>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-lime-200/22 bg-lime-300/8 p-4 text-center">
            <div className="text-3xl">🏊</div>
            <div className="mt-2 font-mono text-3xl font-black text-lime-100">{shortNumber(dailyPool)}</div>
            <div className="mt-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-lime-100/55">Daily active pool</div>
            <p className="mt-2 text-xs text-lime-100/50">Splits every 24h among active jumping frogs, proportional to score.</p>
          </div>
          <div className="rounded-2xl border border-sky-200/22 bg-sky-300/8 p-4 text-center">
            <div className="text-3xl">🪙</div>
            <div className="mt-2 font-mono text-3xl font-black text-sky-100">{shortNumber(season?.projectLedger.creatorRewardsRecorded ?? 0)}</div>
            <div className="mt-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-sky-100/55">Creator fees received</div>
            <p className="mt-2 text-xs text-sky-100/50">Total Pump.fun creator fees credited to the active pool since launch.</p>
          </div>
          <div className="rounded-2xl border border-white/12 bg-white/5 p-4 text-center">
            <div className="text-3xl">✅</div>
            <div className="mt-2 font-mono text-3xl font-black text-white/80">{shortNumber(totalPaid)}</div>
            <div className="mt-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-white/45">Rewards paid out</div>
            <p className="mt-2 text-xs text-white/35">Cumulative token distributions to players since launch.</p>
          </div>
          <div className="rounded-2xl border border-white/12 bg-white/5 p-4 text-center">
            <div className="text-3xl">🐸</div>
            <div className="mt-2 font-mono text-3xl font-black text-white/80">{season?.activePlayers ?? 0}</div>
            <div className="mt-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-white/45">Jumpers today</div>
            <p className="mt-2 text-xs text-white/35">Players with at least one active frog competing for today's pool.</p>
          </div>
        </div>
        <div className="mt-3 rounded-xl border border-lime-200/16 bg-lime-300/6 px-4 py-3 text-center text-xs text-lime-100/60">
          To increase your share: activate more frogs, hold {RUNNING_TOADS_TOKEN_SYMBOL} for a score multiplier (up to 3×), or hatch rarer frogs with higher base stats.
        </div>
      </div>
    </section>
  );
}

function LeaderboardTab({ leaderboard, season }: { leaderboard: LeaderboardEntry[]; season: SeasonStats | null }) {
  return (
    <section className="game-panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.18em] text-white/40">Leaderboard</div>
          <h2 className="mt-1 text-3xl font-black text-white">Today's top jumpers</h2>
        </div>
        <div className="flex gap-2">
          <ResourcePill label="Players" value={season?.activePlayers ?? 0} tone="sky" />
          <ResourcePill label="Jumps" value={shortNumber(season?.totalJumps ?? 0)} tone="lime" />
        </div>
      </div>
      <div className="mt-4 grid gap-2">
        {leaderboard.length ? (
          leaderboard.map((entry, index) => {
            const boost = tokenBoost(entry.tokenBalance);
            const medalCls = index === 0
              ? "bg-yellow-300/20 text-yellow-200"
              : index === 1
              ? "bg-white/12 text-white/70"
              : index === 2
              ? "bg-amber-300/15 text-amber-200"
              : "bg-lime-300/10 text-lime-100/60";
            return (
              <div key={`${entry.wallet}-${index}`} className="grid grid-cols-[42px_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-white/10 bg-black/24 px-3 py-3">
                <div className={`grid h-10 w-10 place-items-center rounded-lg font-black ${medalCls}`}>{index + 1}</div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-bold text-white/88">{entry.wallet}</span>
                    <span className={boost.cls}>{boost.mult}</span>
                  </div>
                  <div className="mt-0.5 truncate text-xs text-white/42">
                    🐸 {entry.activeFrogs}/{entry.totalFrogs} jumping
                    {entry.topToad ? ` · ${entry.topToad.name} Lv ${entry.topToad.level}` : ""}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-xl font-black text-sky-200">{shortNumber(entry.dailyJumpScore)}</div>
                  <div className="text-[10px] text-white/35">today</div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="rounded-xl border border-white/10 bg-black/24 p-4 text-sm text-white/45">No jumps today yet — activate a frog to claim the top spot.</div>
        )}
      </div>
    </section>
  );
}

function SeasonsTab({ currentSeasonId }: { currentSeasonId: string }) {
  const features = [
    { icon: "🥇", title: "Weekly Prize Pool", desc: "Top jumpers share a token prize every Sunday based on season score." },
    { icon: "🐸✨", title: "Golden Toad Drop", desc: "Ultra-rare Legendary at 3× jump speed and maxed stats." },
    { icon: "🔥", title: "Token Burn Events", desc: "Portion of creator fees permanently burned, reducing supply." },
    { icon: "🏪", title: "Frog Marketplace", desc: "Trade frogs with other players for SOL or tokens." },
    { icon: "🎬", title: "Full Race Animation", desc: "Real-time animated race mode with live rival tracking." },
    { icon: "🔐", title: "Wallet Login", desc: "Sign with Phantom or Solflare — no more paste-address flow." },
    { icon: "📊", title: "On-Chain Oracle", desc: "Treasury auto-monitors for creator fees — no manual recording." },
    { icon: "🏆", title: "Season Archives", desc: "Full rankings, prizes, and personal records across all seasons." },
  ];

  return (
    <section className="space-y-4">
      <div className="game-panel p-6 text-center">
        <div className="inline-flex rounded-full border border-lime-200/30 bg-lime-300/10 px-4 py-1.5 text-xs font-black uppercase tracking-[0.2em] text-lime-100">
          Coming in V2
        </div>
        <h2 className="mt-4 text-5xl font-black text-white sm:text-6xl">V2 is loading...</h2>
        <p className="mx-auto mt-4 max-w-lg text-sm text-white/55">
          RunningToads V2 ships major upgrades to the economy, gameplay, and social layers.
          Jump now to build your score before the first season rankings lock in.
        </p>
        <div className="mx-auto mt-5 inline-flex items-center gap-2 rounded-xl border border-yellow-200/24 bg-yellow-300/8 px-5 py-2.5 text-sm font-bold text-yellow-100">
          Current season: {currentSeasonId}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {features.map((f) => (
          <div key={f.title} className="game-panel p-4">
            <div className="text-3xl">{f.icon}</div>
            <div className="mt-3 font-black text-white">{f.title}</div>
            <div className="mt-1 text-xs leading-relaxed text-white/50">{f.desc}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function CreatorTab({ dashboard, busy, recordCreatorRewards }: { dashboard: CreatorDashboard | null; busy: boolean; recordCreatorRewards: (amount: number, key: string) => void }) {
  const [amount, setAmount] = useState("");
  const [key, setKey] = useState("");
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
    <section className="space-y-4">
      {/* Auto-sync hero */}
      <div className="game-panel p-6">
        <div className="flex flex-col items-center gap-1 text-center">
          <div className="text-xs font-black uppercase tracking-[0.18em] text-white/40">Automated · On-chain</div>
          <h2 className="text-3xl font-black text-white">Auto-sync</h2>
          <div className="mt-2 text-[10px] font-black uppercase tracking-[0.14em] text-white/40">Last sync</div>
          <div className="font-mono text-3xl font-black text-lime-300">{syncAgeText}</div>
        </div>
        <p className="mt-3 text-center text-sm text-white/48">Vercel Cron runs hourly, fetches every new SOL transfer to the treasury wallet, and credits 100% directly to the active-jumper pool — no manual steps.</p>
        <div className="mt-4 grid grid-cols-3 gap-3">
          <StatBox label="Total syncs" value={ledger?.autoSyncCount ?? 0} />
          <StatBox label="Jumpers today" value={dashboard?.activeJumpersToday ?? 0} />
          <StatBox label="Total recorded" value={shortNumber(ledger?.creatorRewardsRecorded ?? 0)} />
        </div>
        {ledger?.lastProcessedSignature && (
          <div className="mt-3 rounded-lg border border-white/10 bg-black/24 px-3 py-2">
            <div className="text-[10px] font-black uppercase tracking-widest text-white/30">Last tx</div>
            <div className="mt-0.5 truncate font-mono text-xs text-white/50">{ledger.lastProcessedSignature}</div>
          </div>
        )}
        <button
          onClick={() => setShowManual((v) => !v)}
          className="mt-4 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-black text-white/40 transition-colors hover:bg-white/8"
        >
          {showManual ? "Hide manual override" : "Manual override ↓"}
        </button>
        {showManual && (
          <div className="mt-2 space-y-2">
            <input value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Amount received (SOL)" className="w-full rounded-md border border-white/10 bg-white/8 px-3 py-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-lime-200/70" />
            <input value={key} onChange={(event) => setKey(event.target.value)} placeholder="Creator dashboard key" type="password" className="w-full rounded-md border border-white/10 bg-white/8 px-3 py-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-lime-200/70" />
            <button onClick={() => recordCreatorRewards(Number(amount), key)} disabled={busy || !Number(amount)} className="w-full rounded-xl bg-lime-300 px-4 py-3 text-sm font-black text-emerald-950 hover:bg-lime-200 disabled:opacity-40">
              Record manually
            </button>
          </div>
        )}
      </div>

      {/* Stats grid */}
      <div className="game-panel p-4">
        <div className="text-center">
          <div className="text-xs font-black uppercase tracking-[0.18em] text-white/40">Transparency</div>
          <h2 className="mt-1 text-2xl font-black text-white">Creator dashboard</h2>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <StatBox label="Daily active pool" value={shortNumber(ledger?.dailyActivePool ?? 0)} />
          <StatBox label="Rewards paid" value={shortNumber(ledger?.totalJumpRewardsPaid ?? 0)} />
          <StatBox label="Total burned" value={shortNumber(ledger?.totalTokensBurned ?? 0)} />
          <StatBox label="Burned today" value={shortNumber(ledger?.dailyTokensBurned ?? 0)} />
          <StatBox label="Daily jump score" value={shortNumber(dashboard?.totalDailyJumpScore ?? 0)} />
          <StatBox label="Season score" value={shortNumber(dashboard?.totalSeasonJumpScore ?? 0)} />
        </div>
        <div className="mt-4 rounded-lg border border-lime-200/20 bg-lime-300/10 p-4 text-center text-sm text-lime-50/75">
          100% of Pump.fun creator fees go to the daily active pool, split proportionally by jump score.
        </div>
      </div>
    </section>
  );
}

function GameShell({
  activeTab,
  setTab,
  player,
  gate,
  activeFrogs,
  message,
  leaderboard,
  season,
  creatorDashboard,
  busy,
  activateToad,
  deactivateToad,
  openEgg,
  sprintWithToad,
  recordCreatorRewards,
  enterRaceEventWithToad,
  eggResult,
  onClearEgg,
  claimDailyFlies,
  claimFliesSkip,
  guestMode,
  onConnectWallet,
}: {
  activeTab: GameTab;
  setTab: (tab: GameTab) => void;
  player: PlayerState;
  gate: GateResult | null;
  activeFrogs: number;
  message: string;
  leaderboard: LeaderboardEntry[];
  season: SeasonStats | null;
  creatorDashboard: CreatorDashboard | null;
  busy: boolean;
  activateToad: (id: string) => void;
  deactivateToad: (id: string) => void;
  openEgg: () => void;
  sprintWithToad: (id: string) => void;
  recordCreatorRewards: (amount: number, key: string) => void;
  enterRaceEventWithToad: (toadId: string) => void;
  eggResult: EggReveal | null;
  onClearEgg: () => void;
  claimDailyFlies: () => void;
  claimFliesSkip: () => void;
  guestMode?: boolean;
  onConnectWallet?: () => void;
}) {
  return (
    <main className="game-shell min-h-screen px-3 pb-24 pt-3 text-white sm:px-5 xl:pb-5">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-3">
        <TopHud player={player} gate={gate} activeFrogs={activeFrogs} message={message} guestMode={guestMode} onConnectWallet={onConnectWallet} />
        <div className="flex gap-3">
          <TabNav activeTab={activeTab} onChange={setTab} />
          <div className="min-w-0 flex-1">
            {activeTab === "play" && (
              <PlayTab
                player={player}
                busy={busy}
                gate={gate}
                goToFrogs={() => setTab("frogs")}
                claimDailyFlies={claimDailyFlies}
                claimFliesSkip={claimFliesSkip}
              />
            )}
            {activeTab === "frogs" && (
              <FrogsTab
                player={player}
                busy={busy}
                activateToad={activateToad}
                deactivateToad={deactivateToad}
                sprintWithToad={sprintWithToad}
                canSprint={!busy && player.flies >= 2}
              />
            )}
            {activeTab === "hatch" && (
              <HatchTab player={player} busy={busy} openEgg={openEgg} eggResult={eggResult} onClearEgg={onClearEgg} goToFrogs={() => setTab("frogs")} />
            )}
            {activeTab === "races" && (
              <RacesTab player={player} season={season} busy={busy} enterRaceEventWithToad={enterRaceEventWithToad} />
            )}
            {activeTab === "rewards" && (
              <RewardsTab season={season} player={player} />
            )}
            {activeTab === "leaderboard" && <LeaderboardTab leaderboard={leaderboard} season={season} />}
            {activeTab === "seasons" && <SeasonsTab currentSeasonId={player.currentWeekId} />}
            {activeTab === "creator" && <CreatorTab dashboard={creatorDashboard} busy={busy} recordCreatorRewards={recordCreatorRewards} />}
          </div>
        </div>
      </div>
    </main>
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

  const tokenSymbol = gate?.symbol ?? RUNNING_TOADS_TOKEN_SYMBOL;
  const activeFrogs = useMemo(() => player?.toads.filter(t => t.active).length ?? 0, [player]);

  const setTab = useCallback((tab: GameTab) => {
    setActiveTab(tab);
    window.history.replaceState(null, "", `#${tab}`);
  }, []);

  const fetchLeaderboard = useCallback(() => {
    fetch("/api/leaderboard").then((res) => res.json()).then(setLeaderboard).catch(() => {});
  }, []);

  const fetchSeason = useCallback(() => {
    fetch("/api/season").then((res) => res.json()).then(setSeason).catch(() => {});
  }, []);

  const fetchCreatorDashboard = useCallback(() => {
    fetch("/api/creator/dashboard").then((res) => res.json()).then(setCreatorDashboard).catch(() => {});
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
    fetchLeaderboard();
    fetchSeason();
    fetchCreatorDashboard();
    const id = window.setInterval(() => {
      fetchLeaderboard();
      fetchSeason();
      fetchCreatorDashboard();
    }, 8000);
    return () => window.clearInterval(id);
  }, [fetchCreatorDashboard, fetchLeaderboard, fetchSeason]);

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
      fetchLeaderboard();
      fetchSeason();
      fetchCreatorDashboard();
      if ((initData.playerData as PlayerState)?.toads?.length === 0) {
        setTab("hatch");
      } else {
        setTab("play");
      }
      setMessage("Welcome to RunningToads!");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Access check failed.");
    } finally {
      setBusy(false);
      setBusyAction("");
    }
  }

  async function sendAction(action: string, extra: Record<string, unknown> = {}) {
    if (guestMode) {
      setMessage("Connect a wallet to save progress.");
      return null;
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
      fetchLeaderboard();
      fetchSeason();
      fetchCreatorDashboard();
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
    if (data) setMessage("+4 flies!");
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

  async function sprintWithToad(toadId: string) {
    if (!player) return;
    if (player.selectedToadId !== toadId) {
      const sel = await sendAction("select_toad", { toadId });
      if (!sel) return;
    }
    const data = await sendAction("enter_race");
    if (data?.result?.race) {
      const r = data.result.race;
      setMessage(r.won ? `Your frog won the sprint!` : `Sprint finished rank ${r.rank}.`);
    }
  }

  async function enterRaceEventWithToad(toadId: string) {
    const data = await sendAction("enter_race_event", { toadId });
    if (data) {
      const r = data.result;
      setMessage(`Entered race! ${r.entrantCount} competitor${r.entrantCount === 1 ? "" : "s"} so far.`);
    }
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
      fetchCreatorDashboard();
      fetchSeason();
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
      activeFrogs={activeFrogs}
      message={message}
      leaderboard={leaderboard}
      season={season}
      creatorDashboard={creatorDashboard}
      busy={busy}
      activateToad={activateToad}
      deactivateToad={deactivateToad}
      openEgg={openEgg}
      sprintWithToad={sprintWithToad}
      recordCreatorRewards={recordCreatorRewards}
      enterRaceEventWithToad={enterRaceEventWithToad}
      eggResult={eggResult}
      onClearEgg={() => setEggResult(null)}
      claimDailyFlies={claimDailyFlies}
      claimFliesSkip={claimFliesSkip}
      guestMode={guestMode}
      onConnectWallet={exitGuestMode}
    />
  );
}
