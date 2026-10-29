import { useEffect, useRef, useState, type ReactNode } from "react";
import { IconRefresh, IconTargetArrow } from "@tabler/icons-react";
import Glass from "../../components/ui/glass";
import Select from "../../components/ui/select";
import Skeleton from "../../components/ui/skeleton";
import type { OverviewStats, RecentMatch, StatsStatus, ValAcc } from "../../components/core/types";

type Tier = {
  tier: number;
  tierName: string;
  largeIcon?: string | null;
  smallIcon?: string | null;
};

type Agent = {
  displayName: string;
  displayIcon: string | null;
  fullPortrait: string | null;
  backgroundGradientColors?: string[];
  role?: { displayName?: string } | null;
};

type HomeProps = {
  account: ValAcc | null;
  stats: OverviewStats | null;
  status: StatsStatus;
  rangeStatus: StatsStatus;
  error: string | null;
  onRefresh: () => void;
  limit: number;
  onLimit: (limit: number) => void;
};

const ranges = [{ label: "Last 5 matches", value: 5 }, { label: "Last 10 matches", value: 10 }, { label: "Last 20 matches", value: 20 }];
const gameTypes = [
  { label: "All game types", value: "all" },
  { label: "Competitive", value: "competitive" },
  { label: "Unrated", value: "unrated" },
  { label: "Swiftplay", value: "swiftplay" },
  { label: "Spike Rush", value: "spikerush" },
  { label: "Deathmatch", value: "deathmatch" },
  { label: "Team Deathmatch", value: "teamdeathmatch" },
];
const modeIds: Record<string, string> = {
  standard: "96bd3920-4f36-d026-2b28-c683eb0bcac5",
  swiftplay: "5d0f264b-4ebe-cc63-c147-809e1374484b",
  spikerush: "e921d1e6-416b-c31f-1291-74930c330b7b",
  deathmatch: "a8790ec5-4237-f2f0-e93b-08a8e89865b2",
  teamdeathmatch: "e086db66-47fd-e791-ca81-06a645ac7661",
};
const modeNames: Record<string, string> = {
  "96bd3920-4f36-d026-2b28-c683eb0bcac5": "Standard",
  "5d0f264b-4ebe-cc63-c147-809e1374484b": "Swiftplay",
  "e921d1e6-416b-c31f-1291-74930c330b7b": "Spike Rush",
  "a8790ec5-4237-f2f0-e93b-08a8e89865b2": "Deathmatch",
  "e086db66-47fd-e791-ca81-06a645ac7661": "Team Deathmatch",
};

function Home({ account, stats, status, rangeStatus, error, onRefresh, limit, onLimit }: HomeProps) {
  const [tiers, setTiers] = useState<Record<number, Tier>>({});
  const [agent, setAgent] = useState<Agent | null>(null);
  const [cardFailed, setCardFailed] = useState(false);
  const [portraitFailed, setPortraitFailed] = useState(false);
  const [gameFilter, setGameFilter] = useState("all");
  const matchList = useRef<HTMLDivElement>(null);
  const filterMounted = useRef(false);

  useEffect(() => {
    if (!filterMounted.current) {
      filterMounted.current = true;
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    matchList.current?.animate(
      [{ opacity: 0, transform: "translateY(5px)" }, { opacity: 1, transform: "translateY(0)" }],
      { duration: 180, easing: "ease-out" },
    );
  }, [gameFilter]);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const response = await fetch("https://valorant-api.com/v1/competitivetiers");
        if (!response.ok) return;
        const result = (await response.json()) as { data?: { tiers?: Tier[] }[] };
        const sets = result.data ?? [];
        const catalog = sets[sets.length - 1]?.tiers ?? sets[0]?.tiers ?? [];
        if (active) setTiers(Object.fromEntries(catalog.map((tier) => [tier.tier, tier])));
      } catch {
        // Use the built-in rank names when the public asset catalog is offline.
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    setAgent(null);
    setPortraitFailed(false);
    const agentId = stats?.agent;
    if (!agentId) return;

    async function load() {
      try {
        const response = await fetch(`https://valorant-api.com/v1/agents/${agentId}`);
        if (!response.ok) return;
        const result = (await response.json()) as { data?: Agent };
        if (active && result.data) setAgent(result.data);
      } catch {
        // The agent name still falls back to a simple unavailable state.
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [stats?.agent]);

  useEffect(() => setCardFailed(false), [account?.playerCardId]);

  const cardId = account?.playerCardId && !cardFailed ? account.playerCardId : null;
  const cardArt = cardId
    ? `https://media.valorant-api.com/playercards/${cardId}/smallart.png`
    : null;
  const backdrop = cardId
    ? `https://media.valorant-api.com/playercards/${cardId}/largeart.png`
    : null;
  const games = stats?.games ?? null;
  const wins = stats?.wins ?? null;
  const winRate = games != null && games > 0 && wins != null
    ? Math.round((wins / games) * 100)
    : null;
  const recentCount = stats?.recentGames ?? null;
  const recentMatches = stats?.recentMatches ?? [];
  const filteredMatches = recentMatches.filter((match) => gameFilter === "all" || matchGameType(match) === gameFilter).slice(0, 5);
  const kd = stats?.kd == null ? null : stats.kd.toFixed(2);
  const rangeLoading = status === "checking" || rangeStatus === "checking";
  const accuracyAccent = agentAccent(agent?.backgroundGradientColors);
  const recentDetail = rangeLoading
    ? "Updating recent performance"
    : stats?.matchError
    ? "Match history unavailable"
    : recentCount == null
      ? "No recent match data"
      : recentCount === 0
        ? "No recent matches"
        : `Last ${recentCount} matches`;

  return (
    <div className="h-full overflow-y-auto px-7 pb-7 pt-12 [scrollbar-color:rgba(255,255,255,0.18)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/15 [&::-webkit-scrollbar-thumb:hover]:bg-white/25 [&::-webkit-scrollbar-track]:bg-transparent">
      <div className="mx-auto max-w-5xl space-y-2">
        <Glass className="relative rounded-lg p-3.5 sm:p-4">
          {backdrop && (
            <img
              alt=""
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 size-full scale-110 object-cover opacity-20 blur-xl"
              onError={() => setCardFailed(true)}
              src={backdrop}
            />
          )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/80 via-black/70 to-black/80" />
          <div className="relative z-20">
            <div className="flex min-w-0 items-center gap-3">
              {cardArt ? (
                <img
                  alt=""
                  className="size-11 shrink-0 rounded-md border border-white/15 object-cover"
                  onError={() => setCardFailed(true)}
                  src={cardArt}
                />
              ) : (
                <div className="size-11 shrink-0 rounded-md border border-white/10 bg-white/[0.04]" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">
                  {account ? account.gameName : status === "checking" ? <Skeleton className="h-4 w-28" /> : "VALORANT account"}
                </p>
                <p className="mt-0.5 truncate text-xs text-white/55">
                  {account ? `#${account.tagLine}` : status === "checking" ? <Skeleton className="h-3 w-16" /> : "Riot Client profile"}
                </p>
              </div>
              <button
                aria-label="Refresh account stats"
                className="flex h-8 shrink-0 items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-2.5 text-[11px] text-zinc-300 transition-colors hover:bg-white/[0.09] hover:text-white disabled:cursor-wait disabled:opacity-50"
                disabled={status === "checking"}
                onClick={onRefresh}
                type="button"
              >
                <IconRefresh aria-hidden="true" className={`size-3.5 ${status === "checking" ? "animate-spin" : ""}`} />
                {status === "checking" ? "Refreshing" : "Refresh"}
              </button>
            </div>

            <div className="my-3 h-px bg-white/[0.09]" />

            <div className="grid grid-cols-2 divide-x divide-white/[0.08] md:grid-cols-4">
              <RankCell
                label="Current rank"
                tier={stats?.currentTier ?? null}
                tiers={tiers}
                status={status}
                rating={stats?.rating}
              />
              <RankCell
                label="Peak rank"
                tier={stats?.peakTier ?? null}
                tiers={tiers}
                status={status}
              />
              <ValueCell
                label="Win rate"
                value={winRate == null ? emptyValue(status) : `${winRate}%`}
                detail={games != null && wins != null ? (
                  <>
                    <span className="text-emerald-400">{wins}W</span>
                    <span className="px-1 text-zinc-600">·</span>
                    <span className="text-rose-400">{Math.max(games - wins, 0)}L</span>
                  </>
                ) : "This season"}
              />
              <ValueCell
                label="Ranked games"
                value={games == null ? emptyValue(status) : games.toString()}
                detail="This season"
              />
            </div>

            {(error || stats?.rankError) && (
              <p className="mt-3 break-words text-[10px] leading-4 text-amber-100/65">
                {friendlyError(error ?? stats?.rankError ?? "")}
              </p>
            )}
          </div>
        </Glass>

        <div className="grid grid-cols-1 items-stretch gap-3 sm:grid-cols-[minmax(190px,0.72fr)_minmax(0,1.28fr)]">
          <section aria-label="Most played agent" className="relative min-h-[315px] overflow-hidden">
            {agent?.fullPortrait && !portraitFailed ? (
              <img
                alt={agent.displayName}
                className="pointer-events-none absolute inset-0 size-full -translate-y-5 scale-110 object-contain object-right-bottom drop-shadow-[0_18px_32px_rgba(0,0,0,0.7)]"
                onError={() => setPortraitFailed(true)}
                src={agent.fullPortrait}
              />
            ) : agent?.displayIcon && !portraitFailed ? (
              <img
                alt={agent.displayName}
                className="pointer-events-none absolute bottom-3 right-2 size-36 object-contain opacity-75"
                onError={() => setPortraitFailed(true)}
                src={agent.displayIcon}
              />
            ) : null}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#080808]/85 via-[#080808]/15 to-transparent" />
            <div className="relative z-10 p-3">
              <p className="text-[10px] font-medium text-zinc-500">Most Played</p>
              <p className="mt-1 text-lg font-semibold text-zinc-100">
                {agent?.displayName ?? (status === "checking" ? <Skeleton className="h-5 w-20" /> : "No agent data")}
              </p>
              <p className="mt-1 text-[10px] text-zinc-400">
                {agent?.role?.displayName && `${agent.role.displayName} · `}
                {stats?.agentGames != null && recentCount != null
                  ? `${stats.agentGames} matches`
                  : "From recent matches"}
              </p>
            </div>
          </section>

          <div className="space-y-2">
            <Select label="Match range" value={limit} options={ranges} onChange={onLimit} className="w-full" />
            <Glass className="rounded-lg p-4">
              <div className="relative z-20">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-zinc-200">Recent performance</p>
                  <p className="text-[10px] text-zinc-500">{recentDetail}</p>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] text-zinc-500">K/D ratio</p>
                    <p className="mt-1 text-2xl font-semibold tracking-tight text-white">{rangeLoading ? <Skeleton className="h-7 w-16" /> : kd ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-zinc-500">Headshot %</p>
                    <p className="mt-1 text-2xl font-semibold tracking-tight text-white">{rangeLoading ? <Skeleton className="h-7 w-20" /> : stats?.headshotPct == null ? "—" : `${stats.headshotPct.toFixed(1)}%`}</p>
                  </div>
                </div>
              </div>
            </Glass>
            <Glass className="rounded-lg p-4">
              <div className="relative z-20">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-zinc-200">Accuracy</p>
                  <p className="text-[10px] text-zinc-500">{recentDetail}</p>
                </div>
                <div className="mt-3 space-y-3">
                  <Accuracy label="Head" value={stats?.headshotPct} count={stats?.headshots} loading={rangeLoading} accent={accuracyAccent} />
                  <Accuracy label="Body" value={stats?.bodyshotPct} count={stats?.bodyshots} loading={rangeLoading} accent={accuracyAccent} />
                  <Accuracy label="Legs" value={stats?.legshotPct} count={stats?.legshots} loading={rangeLoading} accent={accuracyAccent} />
                </div>
              </div>
            </Glass>
          </div>
        </div>
        <Glass className="rounded-lg p-0">
          <div className="relative z-20">
            <div className="flex items-center justify-between border-b border-white/[0.08] px-3.5 py-2.5">
              <div className="flex items-center gap-2.5">
                <h2 className="text-xs font-medium text-zinc-200">Recent matches</h2>
              </div>
              <Select label="Game type" value={gameFilter} options={gameTypes} onChange={setGameFilter} />
            </div>
            <div ref={matchList}>
              {status === "checking" ? (
                <div>{[0, 1, 2, 3, 4].map((item) => <RecentSkeleton key={item} />)}</div>
              ) : filteredMatches.length ? (
                filteredMatches.map((match, index) => <RecentRow key={`${match.started ?? index}-${index}`} match={match} tiers={tiers} />)
              ) : <p className="px-3.5 py-5 text-[11px] text-zinc-500">{recentMatches.length ? "No matches found for this game type" : recentDetail}</p>}
            </div>
          </div>
        </Glass>
      </div>
    </div>
  );
}

function friendlyError(error: string) {
  return error.includes("HTTP 429")
    ? "Riot temporarily rate-limited rank lookups (HTTP 429). Rank data will retry on the next refresh."
    : error;
}

function RecentSkeleton() {
  return (
    <div className="relative isolate flex h-[78px] items-stretch overflow-hidden border-b border-l-[3px] border-white/[0.05] bg-white/[0.015]">
      <div className="relative z-10 flex w-[74px] shrink-0 items-center justify-center p-1">
        <Skeleton className="size-full rounded-md" />
      </div>
      <div className="relative z-10 flex w-[72px] shrink-0 flex-col items-center justify-center gap-1 border-r border-white/[0.06] px-1">
        <Skeleton className="size-8 rounded-full" />
        <Skeleton className="h-2 w-10" />
      </div>
      <div className="relative z-10 flex w-[145px] shrink-0 flex-col justify-center gap-1 px-3">
        <Skeleton className="h-2 w-8" />
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-2 w-14" />
      </div>
      <div className="relative z-10 flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-2">
        <Skeleton className="h-3.5 w-16" />
        <Skeleton className="h-3 w-9" />
      </div>
      <div className="relative z-10 flex w-[100px] shrink-0 items-center justify-end px-3">
        <Skeleton className="h-3 w-14" />
      </div>
    </div>
  );
}

function RecentRow({ match, tiers }: { match: RecentMatch; tiers: Record<number, Tier> }) {
  const [mapLoaded, setMapLoaded] = useState(false);
  const [modeFailed, setModeFailed] = useState(false);
  const map = mapName(match.mapId);
  const rounds = match.roundsWon != null && match.roundsLost != null ? `${match.roundsWon}-${match.roundsLost}` : "—";
  const result = match.won == null ? "border-l-white/10 bg-[#18201f]" : match.won ? "border-l-[#25e0ba] bg-[#082c29]" : "border-l-[#ff4655] bg-[#351a20]";
  const rank = match.tier == null ? null : tiers[match.tier];
  const rankUrl = rank?.smallIcon ?? rank?.largeIcon;
  const ranked = matchGameType(match) === "competitive";
  const type = queueName(match);
  const iconUrl = gameModeIcon(match);
  const date = match.started == null ? "VALORANT match" : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(match.started));

  return (
    <div className={`relative isolate flex h-[78px] items-stretch overflow-hidden border-b border-l-[3px] border-white/[0.05] ${result}`} title={`${date} · ${map} · ${type}`}>
      {match.mapId && <img alt="" aria-hidden="true" className={`pointer-events-none absolute inset-y-0 right-0 h-full w-[48%] object-cover object-center transition-opacity duration-500 [mask-image:linear-gradient(to_right,transparent,black_48%)] ${mapLoaded ? "opacity-55" : "opacity-0"}`} onLoad={() => setMapLoaded(true)} src={`https://media.valorant-api.com/maps/${match.mapId}/splash.png`} />}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-black/20" />

      <div className="relative z-10 flex w-[74px] shrink-0 items-center justify-center p-1">
        {match.agentId ? <img alt="" className="size-full object-cover" src={`https://media.valorant-api.com/agents/${match.agentId}/displayicon.png`} /> : <div className="size-full bg-white/[0.04]" />}
      </div>

      <div className="relative z-10 flex w-[72px] shrink-0 flex-col items-center justify-center gap-0.5 border-r border-white/[0.06] px-1">
        {ranked && rankUrl ? <img alt="" className="size-8 object-contain" src={rankUrl} /> : !ranked && iconUrl && !modeFailed ? <img alt="" className="size-8 object-contain opacity-90" onError={() => setModeFailed(true)} src={iconUrl} /> : <IconTargetArrow aria-hidden="true" className="size-7 text-white/65" stroke={1.6} />}
        {ranked && <span className={`text-[10px] font-medium tabular-nums ${match.rr == null ? "text-white/45" : match.rr >= 0 ? "text-[#25e0ba]" : "text-[#ff4655]"}`}>{match.rr == null ? "— RR" : `${match.rr > 0 ? "+" : ""}${match.rr} RR`}</span>}
        <span className="max-w-full truncate text-[8px] font-medium uppercase tracking-wide text-white/55">{type}</span>
      </div>

      <div className="relative z-10 flex w-[145px] shrink-0 flex-col justify-center px-3">
        <span className="text-[10px] tracking-wide text-white/45">KDA</span>
        <span className="text-[13px] tabular-nums text-zinc-100">{match.kills ?? 0} / {match.deaths ?? 0} / {match.assists ?? 0}</span>
        <span className="mt-0.5 w-fit bg-black/20 px-1.5 py-0.5 text-[9px] leading-none tracking-wide text-white/65">SCORE&nbsp; {match.score == null ? "—" : match.score.toLocaleString()}</span>
      </div>

      <div className="relative z-10 flex min-w-0 flex-1 flex-col items-center justify-center px-2 text-center">
        <span className={`text-[15px] font-semibold leading-5 ${match.won ? "text-[#25e0ba]" : match.won === false ? "text-[#ff4655]" : "text-white/60"}`}>{match.won ? "VICTORY" : match.won === false ? "DEFEAT" : "COMPLETE"}</span>
        <span className="text-[13px] tabular-nums text-white/75">{rounds}</span>
      </div>

      <div className="relative z-10 flex w-[100px] shrink-0 items-center justify-end px-3">
        {match.mvp && <span className="whitespace-nowrap text-[10px] font-semibold text-white drop-shadow-md sm:text-xs">TEAM MVP</span>}
      </div>
    </div>
  );
}

function gameModeIcon(match: RecentMatch) {
  const source = match.mode?.trim() ?? "";
  const kind = matchGameType(match);
  const id = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(source)
    ? source
    : modeIds[kind] ?? (kind === "unrated" || kind === "competitive" ? modeIds.standard : undefined);
  return id ? `https://media.valorant-api.com/gamemodes/${id}/displayicon.png` : null;
}

function matchGameType(match: RecentMatch) {
  if (match.competitive || match.rr != null || match.tier != null) return "competitive";

  const queue = gameType(match.queue?.trim() || null);
  if (queue !== "other" && queue !== "standard") return queue;

  const mode = gameType(match.mode?.trim() || null);
  if (mode !== "other" && mode !== "standard") return mode;
  if (queue === "standard" || mode === "standard") return "standard";
  return queue !== "other" ? queue : mode;
}

function gameType(value: string | null) {
  const key = (value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (key.includes("competitive") || key === "ranked") return "competitive";
  if (key.includes("swiftplay")) return "swiftplay";
  if (key.includes("spikerush")) return "spikerush";
  if (key.includes("teamdeathmatch") || key.includes("hurm")) return "teamdeathmatch";
  if (key.includes("deathmatch")) return "deathmatch";
  if (key.includes("unrated") || key.includes("bomb")) return "unrated";
  if (key === modeIds.swiftplay.replace(/-/g, "")) return "swiftplay";
  if (key === modeIds.spikerush.replace(/-/g, "")) return "spikerush";
  if (key === modeIds.deathmatch.replace(/-/g, "")) return "deathmatch";
  if (key === modeIds.teamdeathmatch.replace(/-/g, "")) return "teamdeathmatch";
  if (key === modeIds.standard.replace(/-/g, "") || key === "standard") return "standard";
  return "other";
}

function queueName(match: RecentMatch) {
  const source = match.queue?.trim() || match.mode?.trim() || "";
  const kind = matchGameType(match);
  if (kind === "competitive") return "Competitive";
  const byId = modeNames[source.toLowerCase()];
  const fallback = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(source) ? "Game mode" : source || "VALORANT";
  const names: Record<string, string> = { competitive: "Competitive", unrated: "Unrated", standard: "Standard", swiftplay: "Swiftplay", spikerush: "Spike Rush", deathmatch: "Deathmatch", teamdeathmatch: "Team Deathmatch", other: fallback };
  return byId ?? names[kind];
}

function mapName(id: string) {
  const parts = id.split("/").filter(Boolean);
  const key = (parts[parts.length - 1] ?? "").toLowerCase();
  const names: Record<string, string> = { triad: "Haven", duality: "Bind", port: "Ascent", bonsai: "Split", foxtrot: "Breeze", canyon: "Fracture", pitt: "Pearl", jam: "Lotus", juliett: "Sunset", infinity: "Abyss", juliett2: "Corrode" };
  return names[key] ?? (key.replace(/([a-z])([A-Z])/g, "$1 $2") || "VALORANT");
}

function Accuracy({ label, value, count, loading, accent }: { label: string; value: number | null | undefined; count: number | null | undefined; loading: boolean; accent: string }) {
  const progress = Math.max(0, Math.min(100, value ?? 0));
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[10px]">
        <span className="text-zinc-400">{label}</span>
        <span className="tabular-nums text-zinc-300">{loading ? <Skeleton className="h-3 w-16" /> : <>{value == null ? "—" : `${value.toFixed(1)}%`}<span className="ml-2 text-zinc-600">{count == null ? "" : `${count} hits`}</span></>}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full" style={{ width: `${progress}%`, backgroundColor: accent }} />
      </div>
    </div>
  );
}

function agentAccent(colors?: string[]) {
  const color = colors?.[colors.length - 1];
  if (!color) return "#6a98dc";
  const value = color.startsWith("#") ? color : `#${color}`;
  return /^#[\da-f]{6}$/i.test(value) ? value : "#6a98dc";
}

function RankCell({
  label,
  tier,
  tiers,
  status,
  rating,
}: {
  label: string;
  tier: number | null;
  tiers: Record<number, Tier>;
  status: StatsStatus;
  rating?: number | null;
}) {
  const info = tier == null ? undefined : tiers[tier];
  const icon = info?.smallIcon || info?.largeIcon;
  const value = tier != null && tier >= 3
    ? formatRank(info?.tierName, tier)
    : tier === 0 || (tier != null && tier > 0 && tier < 3)
      ? "Unranked"
      : status === "checking"
        ? "…"
        : status === "error"
          ? "Unavailable"
          : label === "Peak rank"
            ? "No peak yet"
            : "No rank data";

  const hasProgress = label === "Current rank" && tier != null && tier >= 3 && rating != null;
  const progress = rating == null ? 0 : Math.min(100, Math.max(0, rating));

  return (
    <div className="min-w-0 px-2 first:pl-0 last:pr-0 md:px-3">
      <p className="text-[10px] text-zinc-500">{label}</p>
      <div className="mt-1 flex min-w-0 items-center gap-2">
        {icon && <img alt="" className="size-6 shrink-0 object-contain" src={icon} />}
        <p className="truncate text-[13px] font-medium text-zinc-100">{status === "checking" ? <Skeleton className="h-4 w-20" /> : value}</p>
      </div>
      {hasProgress && (
        <div className="mt-2">
          <div
            aria-label={`${progress} of 100 rank rating`}
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={progress}
            className="h-1 overflow-hidden rounded-full bg-white/10"
            role="progressbar"
          >
            <div className="h-full rounded-full bg-white/75 transition-[width] duration-300" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-1 text-[10px] tabular-nums text-zinc-500">{progress} / 100 RR</p>
        </div>
      )}
    </div>
  );
}

function ValueCell({ label, value, detail }: { label: string; value: string; detail: ReactNode }) {
  return (
    <div className="min-w-0 px-2 first:pl-0 last:pr-0 md:px-3">
      <p className="text-[10px] text-zinc-500">{label}</p>
      <p className="mt-1 truncate text-[13px] font-medium text-zinc-100">{value === "…" ? <Skeleton className="h-4 w-14" /> : value}</p>
      <p className="mt-0.5 truncate text-[10px] text-zinc-500">{detail}</p>
    </div>
  );
}

function emptyValue(status: StatsStatus) {
  return status === "checking" ? "…" : status === "error" ? "—" : "—";
}

function formatRank(value: string | undefined, tier: number) {
  if (value) {
    return value
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  if (tier === 27) return "Radiant";
  const names = ["Iron", "Bronze", "Silver", "Gold", "Platinum", "Diamond", "Ascendant", "Immortal"];
  const offset = tier - 3;
  return `${names[Math.floor(offset / 3)] ?? "Rank"} ${(offset % 3) + 1}`;
}

export default Home;
