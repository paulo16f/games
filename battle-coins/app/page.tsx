"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, Coins, Egg, Flag, History, LayoutDashboard, Trophy, Users } from "lucide-react";
import {
  ACTION_COSTS,
  TOAD_JUMP_BUY_URL,
  TOAD_JUMP_TOKEN_SYMBOL,
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



const gameTabs: Array<{ id: GameTab; label: string; Icon: typeof Activity }> = [
  { id: "play",        label: "Activity",    Icon: Activity },
  { id: "frogs",       label: "Frogs",       Icon: Users },
  { id: "hatch",       label: "Hatch",       Icon: Egg },
  { id: "races",       label: "Races",       Icon: Flag },
  { id: "rewards",     label: "Rewards",     Icon: Coins },
  { id: "leaderboard", label: "Ranks",       Icon: Trophy },
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
}: {
  player: PlayerState;
  gate: GateResult | null;
  guestMode?: boolean;
  onConnectWallet?: () => void;
}) {
  const balance = gate?.balance ?? player.tokenBalance;
  const boost = tokenBoost(balance);

  return (
    <header className="sticky top-0 z-30 game-panel">
      <div className="flex items-center gap-3 px-3 py-2.5">
        {/* Left: logo + wordmark */}
        <FallbackImage
          src={assetPaths.logo}
          fallback={assetPaths.sourceToads}
          alt="Toad Jump"
          className="h-9 w-9 shrink-0 rounded-lg object-cover"
        />
        <span className="pixel text-[13px] text-yellow-300 leading-tight">Toad Jump</span>

        {/* Right: stats pushed to the right */}
        {guestMode ? (
          <button onClick={onConnectWallet} className="ml-auto text-base font-bold text-amber-300 hover:text-amber-200 transition-colors">
            Guest · Connect wallet →
          </button>
        ) : (
          <div className="ml-auto flex items-center gap-4">
            <span className="hidden font-mono text-base text-white/55 sm:block">{formatWallet(player.wallet)}</span>
            <span className="text-sm text-white/55">🪰 <span className="font-mono font-bold text-yellow-300">{player.flies}</span></span>
            <span className="text-sm text-white/55"><span className="font-mono font-bold text-yellow-300">{shortNumber(balance)}</span> <span className="text-white/40">$TOAD</span></span>
            <span className={boost.cls}>{boost.mult} {boost.label}</span>
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
        <p className="pixel text-sm text-white/80">Idle frogs. Real tokens. On Solana.</p>
      </div>

      {/* Middle — connect card */}
      <div className="relative z-10 flex flex-1 items-center justify-center py-4">
        <div className="w-full max-w-sm rounded-xl border border-white/15 bg-black/35 p-5 backdrop-blur-md">
          <input
            value={walletInput}
            onChange={(event) => setWalletInput(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && checkAccess()}
            placeholder="Paste Solana wallet address"
            className="pixel w-full rounded-lg border border-white/20 bg-white/10 px-4 py-3 text-sm text-white outline-none placeholder:text-white/55 focus:border-yellow-400/60 transition-colors"
          />
          {message && (
            <div className="pixel mt-2 text-sm text-white/80" aria-live="polite">{message}</div>
          )}
          {gate?.balance !== undefined && (
            <div className="pixel mt-1 text-sm text-white/80">Balance: <span className="font-mono font-bold text-yellow-300">{shortNumber(gate.balance)}</span> {gate.symbol}</div>
          )}
          <div className="mt-4 grid grid-cols-2 gap-3">
            <button
              onClick={checkAccess}
              disabled={busy}
              className="pixel rounded-lg bg-yellow-400 py-4 text-sm font-black text-black shadow-[0_4px_0_rgba(0,0,0,0.5),0_0_20px_rgba(255,215,0,0.3)] hover:bg-yellow-300 active:translate-y-[2px] active:shadow-none transition-all disabled:opacity-50"
            >
              {busyAction === "check" ? "Loading..." : "▶ Connect"}
            </button>
            <button
              onClick={onPlayAsGuest}
              disabled={busy}
              className="pixel rounded-lg border border-white/30 bg-white/12 py-4 text-sm font-black text-white hover:bg-white/20 active:scale-95 transition-all disabled:opacity-50"
            >
              👁 Guest
            </button>
          </div>
        </div>
      </div>

      {/* Bottom — boost tiers */}
      <div className="relative z-10 w-full max-w-sm mx-auto pb-8">
        <div className="mb-3 pixel text-center text-sm text-white/70 uppercase tracking-widest">Hold tokens to boost your score</div>
        <div className="space-y-1.5">
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
        </div>
        <a
          href={TOAD_JUMP_BUY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="pixel mt-3 block text-center text-sm text-yellow-300/75 hover:text-yellow-300 transition-colors"
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
    <div className="rounded-xl border-2 border-yellow-400/30 bg-yellow-400/6 p-4"
      style={{ boxShadow: "0 0 18px rgba(255,215,0,0.08) inset" }}>
      <div className="flex items-center justify-between gap-3">
        {/* Fly counter */}
        <div>
          <div className="flex items-baseline gap-2">
            <span className="pixel text-sm text-yellow-400">🪰 FLIES</span>
            <span className="pixel font-mono text-3xl font-black text-white">{player.flies}</span>
          </div>
          <div className="pixel text-sm text-white/55 mt-2 leading-loose">
            {onCooldown
              ? `⏳ next in ${mins}:${String(secs).padStart(2, "0")}`
              : "▶ free +5 ready!"}
          </div>
        </div>

        {/* Buttons */}
        <div className="flex flex-col gap-2 shrink-0">
          {onCooldown && balance >= 1 && (
            <button
              onClick={claimFliesSkip}
              disabled={busy}
              className="pixel text-sm rounded-lg border border-yellow-200/35 bg-yellow-300/12 px-3 py-2 text-yellow-200 hover:bg-yellow-300/22 active:scale-95 transition-all disabled:opacity-40"
            >
              Skip w/ Token
            </button>
          )}
          <button
            onClick={claimDailyFlies}
            disabled={busy || onCooldown}
            className="pixel text-sm rounded-lg bg-yellow-400 px-4 py-2.5 text-black shadow-[0_4px_0_rgba(0,0,0,0.45),0_0_16px_rgba(255,215,0,0.3)] hover:bg-yellow-300 active:translate-y-[2px] active:shadow-none transition-all disabled:opacity-40"
          >
            {onCooldown ? "✓ Claimed" : "Claim +5 🪰"}
          </button>
        </div>
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

function LiveJumpStats({ toad, scorePerJump, compact = false }: { toad: Toad; scorePerJump: number; compact?: boolean }) {
  const [hops, setHops] = useState(0);

  useEffect(() => {
    const CYCLE = RARITY_CYCLE_MS[toad.rarity] ?? 5_000;
    const start = Date.now();
    const id = setInterval(() => {
      const elapsed = Date.now() - start;
      setHops(Math.floor(elapsed / CYCLE));
    }, 250);
    return () => clearInterval(id);
  }, [toad.rarity]);

  const sessionPts = hops * scorePerJump;

  if (compact) {
    return (
      <div className="mt-2 pt-2 border-t border-white/10 flex justify-around text-center">
        <div>
          <div key={hops} className="num-tick pixel font-mono text-base font-black text-white">{hops}</div>
          <div className="pixel text-sm text-white/50 mt-0.5">hops</div>
        </div>
        <div>
          <div key={sessionPts} className="num-tick pixel font-mono text-base font-black text-yellow-300">{shortNumber(sessionPts)}</div>
          <div className="pixel text-sm text-white/50 mt-0.5">pts</div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/10 w-full">
      <div className="text-center">
        <div key={hops} className="num-tick pixel font-mono text-2xl font-black text-white">{hops}</div>
        <div className="pixel text-sm text-white/60 mt-0.5">Session hops</div>
      </div>
      <div className="text-center">
        <div key={sessionPts} className="num-tick pixel font-mono text-2xl font-black text-yellow-300">{shortNumber(sessionPts)}</div>
        <div className="pixel text-sm text-white/60 mt-0.5">Pts earned</div>
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

      {/* Stat strip — 4 equal columns across full width */}
      <div className="grid grid-cols-3 divide-x divide-yellow-400/10 rounded-lg border border-yellow-400/18 bg-yellow-400/4">
        {[
          { label: "Daily pts",   value: shortNumber(player.dailyJumpScore) },
          { label: "Total jumps", value: shortNumber(player.lifetimeJumps) },
          { label: "Frogs",       value: activeToads.length },
        ].map(({ label, value }) => (
          <div key={label} className="flex flex-col items-center gap-1.5 py-3">
            <span className="pixel text-base font-black leading-none text-yellow-300">{value}</span>
            <span className="pixel text-sm text-white/55 text-center px-1">{label}</span>
          </div>
        ))}
      </div>

      {/* Fly claim strip */}
      <FlyClaimStrip player={player} balance={balance} busy={busy} claimDailyFlies={claimDailyFlies} claimFliesSkip={claimFliesSkip} />

      {/* Active frogs — 2 per row */}
      {activeToads.length > 0 ? (
        <div className="grid grid-cols-2 gap-3">
          {activeToads.map(toad => {
            const { scorePerJump, ptsPerHour } = toadEarningInfo(toad);
            return (
              <div
                key={toad.id}
                className={`overflow-hidden rounded-xl border border-l-4 p-3 ${toadTone[toad.kind]} ${toadAccent[toad.kind]}`}
              >
                {/* Name on top */}
                <div className="text-center mb-2">
                  <div className="pixel text-sm font-black text-white leading-tight truncate">{toad.name}</div>
                  <div className="pixel text-sm text-white/50 mt-1">{toad.rarity}<br/>Lv {toad.level}</div>
                </div>

                {/* Sprite */}
                <div className="flex justify-center my-2">
                  <ToadSprite toad={toad} className="h-24 w-24" />
                </div>

                {/* Stats */}
                <div className="space-y-1.5 mt-2">
                  <div className="rounded-lg border border-yellow-400/12 bg-yellow-400/5 py-2 text-center">
                    <div className="pixel font-mono text-base font-black text-yellow-300">{shortNumber(ptsPerHour)}</div>
                    <div className="pixel text-sm text-white/50 mt-0.5">pts / hr</div>
                  </div>
                  <div className="rounded-lg border border-sky-400/12 bg-sky-400/5 py-2 text-center">
                    <div className="pixel font-mono text-base font-black text-sky-300">{shortNumber(toad.jumps ?? 0)}</div>
                    <div className="pixel text-sm text-white/50 mt-0.5">all jumps</div>
                  </div>
                </div>

                <LiveJumpStats toad={toad} scorePerJump={scorePerJump} compact />
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 py-12 text-center">
          <div className="text-5xl opacity-40">😴</div>
          <div className="pixel text-sm text-white/40">No frogs jumping yet</div>
          <button
            onClick={goToFrogs}
            className="pixel text-sm rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white/60 transition-colors hover:bg-white/10"
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

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Always auto-select the strongest frog by race potential
  const selectedToad = player.toads.length > 0
    ? player.toads.reduce((best, toad) =>
        racePotential(toad).total >= racePotential(best).total ? toad : best
      )
    : null;

  const windowId = Math.floor(now / 1_800_000);
  const endsAt = (windowId + 1) * 1_800_000;
  const remaining = endsAt - now;
  const mins = Math.floor(remaining / 60_000);
  const secs = Math.floor((remaining % 60_000) / 1000);
  const isClosing = remaining < 60_000;

  const alreadyEntered = player.lastRaceWindowId === windowId;
  const realEntrantCount = alreadyEntered ? 1 : 0;
  const npcSlots = Math.max(0, 4 - realEntrantCount - 1);
  const racePool = season?.projectLedger.racePool ?? 0;
  const result = player.lastRaceResult;

  const enterButtonLabel = () => {
    if (busy) return "Entering...";
    if (alreadyEntered) return "✓ Entered — awaiting race close";
    if (isClosing) return "Race closing — wait for next";
    if (!selectedToad) return "Hatch a frog first!";
    if (player.flies < 2) return "Need 2 flies to enter";
    return "🏁 Enter Race · 2 🪰";
  };
  const canEnter = !busy && !alreadyEntered && !isClosing && !!selectedToad && player.flies >= 2;
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

  return (
    <section className="space-y-3">

      {/* Zone 1 — Countdown + Prize pool */}
      <div className="game-panel p-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col items-center gap-1.5 rounded-xl border border-yellow-400/15 bg-yellow-400/5 py-4 px-2">
            <div className="pixel text-base text-white/60 uppercase tracking-widest">Closes in</div>
            <div className={`pixel text-2xl leading-none ${isClosing ? "animate-pulse text-red-400" : "text-yellow-300"}`}>
              {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
            </div>
          </div>
          <div className="flex flex-col items-center gap-1.5 rounded-xl border border-yellow-400/15 bg-yellow-400/5 py-4 px-2">
            <div className="pixel text-base text-white/60 uppercase tracking-widest">Prize pool</div>
            <div className="pixel text-2xl leading-none text-yellow-300">{shortNumber(racePool)}</div>
            <div className="pixel text-base text-yellow-400/70">$TOAD</div>
          </div>
        </div>
        <div className="pixel text-base text-white/45 text-center mt-3">
          {realEntrantCount} real · {npcSlots} npc · every 30 min
        </div>
      </div>

      {/* Zone 2 — Prize breakdown (right below the counters) */}
      <div className="game-panel p-4">
        <div className="pixel text-base text-white/60 uppercase tracking-widest text-center mb-3">Prize breakdown</div>
        <div className="grid grid-cols-3 gap-2">
          {[
            { medal: "🥇", share: "40%" },
            { medal: "🥈", share: "25%" },
            { medal: "🥉", share: "15%" },
          ].map(t => (
            <div key={t.share} className="rounded-xl border border-yellow-200/14 bg-yellow-300/6 p-3 text-center">
              <div className="text-2xl">{t.medal}</div>
              <div className="pixel text-base text-yellow-300 mt-1.5">{t.share}</div>
              <div className="pixel text-base text-yellow-100/45 mt-1">of pool</div>
            </div>
          ))}
        </div>
        <div className="pixel text-base text-white/45 text-center mt-3">
          Rank 4+ gets 2 🪰 · NPC prizes return to pool
        </div>
      </div>

      {/* Zone 3 — Auto-selected frog racer */}
      {selectedToad ? (() => {
        const pot = racePotential(selectedToad);
        const bars = [
          { label: "Luck",  value: Math.round((selectedToad.luck / 100) * 15), max: 15, color: "bg-yellow-400" },
          { label: "Level", value: Math.round(Math.min((selectedToad.level - 1) * 1.0, 12)), max: 12, color: "bg-purple-400" },
          { label: "Stats", value: Math.round(selectedToad.speed * 0.025 + selectedToad.stamina * 0.02 + selectedToad.consistency * 0.015), max: 12, color: "bg-sky-400" },
        ];
        return (
          <div className="game-panel p-4">
            {/* Header: image + name as one combined block */}
            <div className={`flex items-center gap-4 rounded-xl border-2 p-3 mb-4 ${toadTone[selectedToad.kind]}`}>
              <img
                src={assetPaths.toads[selectedToad.kind]}
                alt={selectedToad.name}
                className="h-20 w-20 shrink-0 object-contain"
              />
              <div className="min-w-0">
                <div className="pixel text-sm text-white/45 mb-1.5">Auto selected</div>
                <div className="pixel text-base text-white font-black leading-snug truncate">{selectedToad.name}</div>
                <div className="pixel text-sm text-white/55 mt-1">{selectedToad.rarity} · Lv {selectedToad.level}</div>
                <div className="pixel text-xl text-yellow-300 mt-2">
                  +{pot.total} <span className="pixel text-sm text-white/45">pts bonus</span>
                </div>
              </div>
            </div>

            {/* Stat bars */}
            <div className="space-y-2">
              {bars.map(b => (
                <div key={b.label} className="flex items-center gap-2">
                  <span className="pixel text-sm w-12 shrink-0 text-white/55">{b.label}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                    <div className={`h-full rounded-full ${b.color}`} style={{ width: `${Math.min(100, Math.round((b.value / b.max) * 100))}%` }} />
                  </div>
                  <span className="pixel text-sm w-8 shrink-0 text-right text-white/75">+{b.value}</span>
                </div>
              ))}
            </div>

            {/* Note */}
            <div className="mt-3 rounded-lg border border-yellow-400/20 bg-yellow-400/6 px-3 py-2 text-center">
              <span className="pixel text-sm text-white/65">75% luck · any frog can win</span>
            </div>
          </div>
        );
      })() : (
        <div className="game-panel p-6 flex flex-col items-center gap-3 text-center">
          <div className="text-4xl">🥚</div>
          <div className="pixel text-sm text-white/40 leading-loose">No frogs yet<br/>go hatch one!</div>
        </div>
      )}

      {/* Zone 4 — Enter button */}
      <button
        onClick={() => selectedToad && enterRaceEventWithToad(selectedToad.id)}
        disabled={!canEnter || busy}
        className={`pixel text-[13px] w-full rounded-xl py-4 transition-all disabled:opacity-50 ${enterButtonStyle}`}
      >
        {enterButtonLabel()}
      </button>

      {/* Zone 5 — Last race result */}
      {result && (
        <div className="game-panel p-4">
          <div className="pixel text-base text-white/60 uppercase tracking-widest mb-3 text-center">Last race result</div>
          <div className="grid grid-cols-3 gap-2">
            <div className={`rounded-xl border p-3 text-center ${rankBorder(result.rank)}`}>
              <div className={`pixel text-xl ${result.rank === 1 ? "text-yellow-300" : result.rank <= 3 ? "text-white" : "text-white/60"}`}>
                #{result.rank}
              </div>
              <div className="pixel text-base text-white/60 mt-1">rank</div>
            </div>
            <div className="rounded-xl border border-yellow-300/20 bg-yellow-300/8 p-3 text-center">
              <div className="pixel text-xl text-yellow-200">{shortNumber(result.score)}</div>
              <div className="pixel text-base text-yellow-200/60 mt-1">score</div>
            </div>
            <div className="rounded-xl border border-yellow-200/20 bg-yellow-300/8 p-3 text-center">
              <div className="pixel text-lg text-yellow-200">
                {result.tokensAwarded > 0 ? shortNumber(result.tokensAwarded) : `+${result.fliesAwarded}`}
              </div>
              <div className="pixel text-base text-yellow-200/60 mt-1">
                {result.tokensAwarded > 0 ? "tokens" : "flies 🪰"}
              </div>
            </div>
          </div>
          {result.toadName && (
            <div className="pixel text-base text-white/50 text-center mt-3">
              Raced with {result.toadName}
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
    "Leap":  "bg-cyan-400",
    "Vigor": "bg-lime-400",
    "Fate":  "bg-violet-400",
    "Focus": "bg-indigo-400",
  };
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
    <section className="grid grid-cols-2 gap-2.5">
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
            className={`flex flex-col overflow-hidden rounded-xl border border-l-2 ${toadAccent[toad.kind]} border-white/8 bg-black/22 transition-all`}
          >
            {/* Image area */}
            <div className={`relative flex items-center justify-center py-3 transition-all ${toad.active ? "bg-yellow-400/5" : ""}`}>
              <img
                src={assetPaths.toads[toad.kind]}
                alt={toad.name}
                className={`h-24 w-24 object-contain transition-all duration-300 ${toad.active ? "" : "grayscale opacity-40"}`}
              />
              <span className="pixel absolute left-1.5 top-1.5 rounded bg-black/55 px-1.5 py-0.5 text-[9px] text-white/65">
                Lv {toad.level}
              </span>
              {toad.active && (
                <span className="pixel absolute right-1.5 top-1.5 rounded bg-yellow-400 px-1.5 py-0.5 text-[9px] font-black text-black shadow-[0_0_8px_rgba(255,215,0,0.5)]">
                  Active
                </span>
              )}
            </div>

            {/* Info */}
            <div className="flex flex-1 flex-col gap-2 px-2.5 pb-2.5">
              <div className="text-center">
                <div className="pixel truncate text-sm font-black text-white">{toad.name}</div>
                <div className="pixel mt-0.5 text-sm text-white/60">{toad.rarity} · Lv {toad.level}</div>
              </div>

              {/* XP to next level */}
              <div>
                <div className="pixel mb-1 flex justify-between text-[9px] text-white/55">
                  <span>{toad.xp}/{xpNeeded} XP</span>
                  <span>→Lv{toad.level + 1}</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/12">
                  <div className="h-full rounded-full bg-yellow-400 transition-all" style={{ width: `${xpPct}%` }} />
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-1">
                {stats.map(([k, v]) => (
                  <div key={k} className={`flex flex-col gap-1 rounded-lg p-1.5 ${statChipBg[k]}`}>
                    <div className="pixel flex items-center justify-between text-[8px]">
                      <span className={statChipLabel[k]}>{statIcon[k]} {k}</span>
                      <span className="font-bold text-white/90">{v}</span>
                    </div>
                    <div className="h-1 overflow-hidden rounded-full bg-white/10">
                      <div className={`h-full rounded-full ${statBarColor[k]}`} style={{ width: `${Math.min(100, v)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1.5 border-t border-white/8 px-2.5 py-2.5">
              <button
                onClick={() => toad.active ? deactivateToad(toad.id) : activateToad(toad.id)}
                disabled={busy}
                className={`pixel flex-1 rounded py-2 text-sm font-black transition-all disabled:opacity-50 ${
                  toad.active
                    ? "bg-yellow-400/18 text-yellow-200 hover:bg-yellow-400/28"
                    : "bg-white/6 text-white/65 hover:bg-white/12"
                }`}
              >
                {toad.active ? "⏸ Pause" : "▶ Activate"}
              </button>
              <button
                onClick={() => sprintWithToad(toad.id)}
                disabled={!canSprint}
                title="Sprint: spend 2 flies for instant jump"
                className="flex h-8 w-8 shrink-0 flex-col items-center justify-center gap-0.5 rounded-full bg-yellow-400 text-black shadow-[0_3px_0_rgba(0,0,0,0.4)] hover:bg-yellow-300 active:translate-y-[2px] active:shadow-none disabled:opacity-35 transition-all"
              >
                <span className="text-sm leading-none">🪰</span>
                <span className="pixel text-[7px] leading-none">Sprint</span>
              </button>
            </div>
          </div>
        );
      })}
      {player.toads.length === 0 && (
        <div className="col-span-2 flex flex-col items-center gap-3 py-12 text-center">
          <div className="text-5xl opacity-40">🥚</div>
          <div className="pixel text-sm text-white/40">No frogs yet — go hatch one!</div>
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

function RewardsTab({ season, player }: { season: SeasonStats | null; player: PlayerState }) {
  const totalDailyScore = season?.dailyJumpScore ?? 0;
  const playerShare = totalDailyScore > 0 ? player.dailyJumpScore / totalDailyScore : 0;
  const dailyPool = season?.projectLedger.dailyActivePool ?? 0;
  const totalPaid = season?.rewardLedger?.totalTokenRewardsPaid ?? 0;

  return (
    <section className="space-y-4 game-panel p-4">

      {/* How rewards work */}
      <div>
        <div className="pixel text-base text-white/55 uppercase tracking-widest text-center mb-3">How rewards work</div>
        <div className="rounded-xl border border-yellow-400/18 bg-yellow-400/5 p-4 text-center space-y-2">
          <p className="pixel text-sm text-white/65 leading-loose">
            Every 24h, 100% of Pump.fun creator fees are distributed to all wallets with active jumping frogs.
          </p>
          <p className="pixel text-sm text-yellow-300 leading-loose">
            No claiming needed — just keep frogs jumping.
          </p>
        </div>
      </div>

      {/* Your estimated share */}
      {player.dailyJumpScore > 0 && (
        <div>
          <div className="pixel text-base text-white/55 uppercase tracking-widest text-center mb-3">Your estimated share</div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Your score today",    value: shortNumber(player.dailyJumpScore),               color: "text-yellow-300" },
              { label: "Share of pool",       value: `${(playerShare * 100).toFixed(2)}%`,             color: "text-yellow-300" },
              { label: "Estimated daily earn",value: `${shortNumber(dailyPool * playerShare)} ${TOAD_JUMP_TOKEN_SYMBOL}`, color: "text-white/80" },
              { label: "Total daily pool",    value: shortNumber(dailyPool),                           color: "text-white/80" },
            ].map(stat => (
              <div key={stat.label} className="rounded-xl border border-white/8 bg-white/4 p-3 flex flex-col items-center gap-2 text-center">
                <div className="pixel text-sm text-white/45 leading-loose">{stat.label}</div>
                <div className={`pixel text-base font-black ${stat.color}`}>{stat.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Treasury overview */}
      <div>
        <div className="pixel text-base text-white/55 uppercase tracking-widest text-center mb-3">Treasury overview</div>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: "Today's reward pool",    value: shortNumber(dailyPool) },
            { label: "Creator fees received",  value: shortNumber(season?.projectLedger.creatorRewardsRecorded ?? 0) },
            { label: "Total paid to players",  value: shortNumber(totalPaid) },
            { label: "Active jumpers today",   value: String(season?.activePlayers ?? 0) },
          ].map(stat => (
            <div key={stat.label} className="rounded-xl border border-white/8 bg-white/4 p-3 flex flex-col items-center gap-2 text-center">
              <div className="pixel text-sm text-white/45 leading-loose">{stat.label}</div>
              <div className="pixel text-base font-black text-yellow-300">{stat.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tip */}
      <div className="rounded-xl border border-yellow-400/18 bg-yellow-400/5 p-4 text-center">
        <p className="pixel text-sm text-white/55 leading-loose">
          Want a bigger share? Activate more frogs, hold {TOAD_JUMP_TOKEN_SYMBOL} tokens for a 3× score boost, or hatch rarer frogs.
        </p>
      </div>

    </section>
  );
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
                  <div className={`pixel text-lg font-black ${podiumScore(i)}`}>{shortNumber(entry.dailyJumpScore)}</div>
                  <div className="pixel text-sm text-white/45 mt-1 truncate">{entry.wallet}</div>
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
                        <span className="pixel text-sm text-white/65 truncate">{entry.wallet}</span>
                        {boost.mult !== "1×" && <span className={`shrink-0 ${boost.cls}`}>{boost.mult}</span>}
                      </div>
                      <div className="pixel text-sm text-white/35 mt-0.5">{entry.activeFrogs}/{entry.totalFrogs} frogs jumping</div>
                    </div>
                    <span className="pixel text-sm font-black text-yellow-300 shrink-0">{shortNumber(entry.dailyJumpScore)}</span>
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

        <div className="rounded-xl border border-yellow-400/22 bg-yellow-400/5 p-4 text-left space-y-2">
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

      {/* Auto-sync panel */}
      <div className="game-panel p-4 space-y-4">
        <div className="text-center">
          <div className="pixel text-sm text-white/45 uppercase tracking-widest mb-2">Automated · On-chain</div>
          <div className="flex items-baseline justify-center gap-3">
            <h2 className="pixel text-xl text-yellow-300">Auto-sync</h2>
            <span className="pixel text-base text-yellow-300">{syncAgeText}</span>
          </div>
          <p className="pixel text-sm text-white/55 leading-loose mt-3">
            Vercel Cron runs hourly, fetches SOL transfers to the treasury wallet, and credits 100% to the active-jumper pool — no manual steps required.
          </p>
        </div>

        {/* Sync stats grid */}
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: "Total syncs",     value: String(ledger?.autoSyncCount ?? 0) },
            { label: "Jumpers today",   value: String(dashboard?.activeJumpersToday ?? 0) },
            { label: "Total recorded",  value: shortNumber(ledger?.creatorRewardsRecorded ?? 0) },
            { label: "Last sync",       value: syncAgeText },
          ].map(stat => (
            <div key={stat.label} className="rounded-xl border border-white/8 bg-white/4 p-3 flex flex-col items-center gap-2 text-center">
              <div className="pixel text-sm text-white/40 leading-loose">{stat.label}</div>
              <div className="pixel text-base font-black text-yellow-300">{stat.value}</div>
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

      {/* Treasury stats */}
      <div className="game-panel p-4 space-y-3">
        <div className="pixel text-base text-white/55 uppercase tracking-widest text-center mb-3">Treasury stats</div>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: "Daily active pool", value: shortNumber(ledger?.dailyActivePool ?? 0) },
            { label: "Rewards paid",      value: shortNumber(ledger?.totalJumpRewardsPaid ?? 0) },
            { label: "Total burned",      value: shortNumber(ledger?.totalTokensBurned ?? 0) },
            { label: "Burned today",      value: shortNumber(ledger?.dailyTokensBurned ?? 0) },
            { label: "Daily jump score",  value: shortNumber(dashboard?.totalDailyJumpScore ?? 0) },
            { label: "Season score",      value: shortNumber(dashboard?.totalSeasonJumpScore ?? 0) },
          ].map(stat => (
            <div key={stat.label} className="rounded-xl border border-white/8 bg-white/4 p-3 flex flex-col items-center gap-2 text-center">
              <div className="pixel text-sm text-white/40 leading-loose">{stat.label}</div>
              <div className="pixel text-base font-black text-yellow-300">{stat.value}</div>
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-yellow-400/18 bg-yellow-400/5 p-3 text-center">
          <p className="pixel text-sm text-white/50 leading-loose">
            100% of Pump.fun creator fees go to the daily active pool, split proportionally by jump score.
          </p>
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
        <TopHud player={player} gate={gate} guestMode={guestMode} onConnectWallet={onConnectWallet} />
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

  const tokenSymbol = gate?.symbol ?? TOAD_JUMP_TOKEN_SYMBOL;
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
      setMessage("Welcome to Toad Jump!");
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
