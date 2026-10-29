import { useEffect, useMemo, useState } from "react";
import { IconUserFilled } from "@tabler/icons-react";
import Glass from "../../components/ui/glass";
import Skeleton from "../../components/ui/skeleton";
import type { CurrentMatch, MatchPlayer, MatchStatus, OverviewStats } from "../../components/core/types";

type Tier = {
  tier: number;
  tierName: string;
  smallIcon?: string | null;
  largeIcon?: string | null;
};

type MapInfo = {
  uuid: string;
  displayName: string;
  splash: string | null;
  mapUrl?: string | null;
};

type Catalog<T> = { data?: T[] };

type MatchProps = {
  connected: boolean;
  match: CurrentMatch | null;
  stats: OverviewStats | null;
  statsLoading: boolean;
  status: MatchStatus;
  error: string | null;
};

function CurrentMatchPage({ connected, match, stats, statsLoading, status, error }: MatchProps) {
  const [maps, setMaps] = useState<Record<string, MapInfo>>({});
  const [tiers, setTiers] = useState<Record<number, Tier>>({});

  useEffect(() => {
    let active = true;

    async function load() {
      const [mapResult, tierResult] = await Promise.allSettled([
        fetch("https://valorant-api.com/v1/maps").then(read<MapInfo>),
        fetch("https://valorant-api.com/v1/competitivetiers").then(async (response) => {
          if (!response.ok) throw new Error("Tier catalog request failed");
          return response.json() as Promise<{ data?: { tiers?: Tier[] }[] }>;
        }),
      ]);

      if (!active) return;
      if (mapResult.status === "fulfilled") {
        setMaps(Object.fromEntries((mapResult.value.data ?? []).map((map) => [map.uuid.toLowerCase(), map])));
      }
      if (tierResult.status === "fulfilled") {
        const sets = tierResult.value.data ?? [];
        const catalog = sets[sets.length - 1]?.tiers ?? sets[0]?.tiers ?? [];
        setTiers(Object.fromEntries(catalog.map((tier) => [tier.tier, tier])));
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  const map = match ? resolveMap(match.mapId, maps) : null;
  const allies = useMemo(() => match?.players.filter((player) => player.team === "ally").sort((a, b) => Number(b.hidden) - Number(a.hidden)) ?? [], [match]);
  const enemies = useMemo(() => match?.players.filter((player) => player.team === "enemy").sort((a, b) => Number(b.hidden) - Number(a.hidden)) ?? [], [match]);
  const me = match?.players.find((player) => player.you);
  const phase = match?.phase === "pregame" ? "Pre-game lobby" : null;
  const queue = match ? displayQueue(match.queueId, match.modeId) : null;

  return (
    <div className="h-full overflow-y-auto px-4 pb-4 pt-11 [scrollbar-color:rgba(255,255,255,0.18)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/15 [&::-webkit-scrollbar-thumb:hover]:bg-white/25 [&::-webkit-scrollbar-track]:bg-transparent">
      <div className="w-full space-y-2.5">
        {status === "checking" && !match ? (
          <Empty title="Checking Riot Client" detail="Looking for your pre-game lobby or current match." />
        ) : status === "error" && !match ? (
          <Empty title="Couldn’t load the match" detail={error ?? "Riot Client match data is unavailable."} />
        ) : !match ? (
          <Empty
            title={connected ? "No current lobby or match" : "Riot Client not connected"}
            detail={connected
              ? "Riot Client is signed in, but there is no active lobby or match to show."
              : "Open Riot Client and sign in to read your current lobby or match."}
          />
        ) : (
          <>
            <Glass className="relative rounded-lg p-3">
              {map?.splash && (
                <img
                  alt=""
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 size-full object-cover opacity-25"
                  src={map.splash}
                />
              )}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/85 via-black/65 to-black/35" />
              <div className="relative z-20 flex min-h-12 items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">{map?.displayName ?? (nameFromId(match.mapId) || "Current match")}</p>
                  <p className="mt-0.5 text-[10px] text-zinc-400">
                    {queue ?? "Mode unavailable"}
                    {phase && <><span className="px-1 text-zinc-600">·</span>{phase}</>}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs font-medium text-zinc-200">{me?.name ?? "Player"}{me?.tagLine ? <span className="text-zinc-500">#{me.tagLine}</span> : null}</p>
                  <p className="mt-0.5 text-[10px] text-zinc-500">{match.players.length} / 10 players</p>
                </div>
              </div>
            </Glass>

            <div className="space-y-2.5">
              <Team title="Your team" team="ally" phase={match.phase} players={allies} stats={stats} statsLoading={statsLoading} tiers={tiers} ownTier={stats?.currentTier ?? null} />
              <Team title="Enemy team" team="enemy" phase={match.phase} players={enemies} stats={null} statsLoading={false} tiers={tiers} ownTier={null} />
            </div>
            {match.players.length === 0 && (
              <Glass className="rounded-lg p-3">
                <p className="relative z-20 text-xs text-zinc-400">Riot hasn’t returned the player roster yet.</p>
              </Glass>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Team({
  title,
  team,
  phase,
  players,
  stats,
  statsLoading,
  tiers,
  ownTier,
}: {
  title: string;
  team: "ally" | "enemy";
  phase: "live" | "pregame";
  players: MatchPlayer[];
  stats: OverviewStats | null;
  statsLoading: boolean;
  tiers: Record<number, Tier>;
  ownTier: number | null;
}) {
  const locked = players.filter((player) => player.selection?.toLowerCase().includes("lock")).length;

  return (
    <Glass className="rounded-lg p-0">
      <div className="relative z-20">
        <div className="flex items-center justify-between border-b border-white/[0.07] px-3 py-2">
          <h2 className="flex items-center gap-2 text-[13px] font-medium text-zinc-100">
            <IconUserFilled aria-hidden="true" className={`size-4 ${team === "ally" ? "text-emerald-400" : "text-rose-400"}`} />
            {title}
          </h2>
          <span className="text-[11px] tabular-nums text-zinc-500">{phase === "live" ? "In match" : `${locked}/${players.length} locked in`}</span>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[620px]">
            <div className="grid border-b border-white/[0.055] px-3 py-1.5 text-[11px] font-medium text-zinc-500" style={{ gridTemplateColumns: "minmax(205px,2fr) minmax(110px,1fr) 58px 58px 58px 64px" }}>
              <span>Player</span><span>Rank</span><span>Win %</span><span>K/D</span><span>HS %</span><span>{phase === "live" ? "ACS" : "Status"}</span>
            </div>
            {players.length ? players.map((player, index) => (
          <PlayerRow
            key={`${player.name}-${player.tagLine ?? index}`}
            player={player}
            phase={phase}
            stats={player.you ? stats : null}
            statsLoading={player.you && statsLoading}
            tier={tiers[player.you && ownTier != null && ownTier >= 3 ? ownTier : player.tier ?? -1]}
            hiddenTier={tiers[0]}
            rankValue={player.you && ownTier != null && ownTier >= 3 ? ownTier : player.tier}
            last={index === players.length - 1}
          />
            )) : <p className="px-3 py-4 text-[11px] text-zinc-500">Team roster unavailable</p>}
          </div>
        </div>
      </div>
    </Glass>
  );
}

function PlayerRow({
  player,
  phase,
  stats,
  statsLoading,
  tier,
  hiddenTier,
  rankValue,
  last,
}: {
  player: MatchPlayer;
  phase: "live" | "pregame";
  stats: OverviewStats | null;
  statsLoading: boolean;
  tier?: Tier;
  hiddenTier?: Tier;
  rankValue: number | null;
  last: boolean;
}) {
  const locked = player.selection?.toLowerCase().includes("lock") ?? false;
  const selected = Boolean(player.agentId);
  const games = stats?.games ?? player.games;
  const wins = stats?.wins ?? player.wins;
  const kd = stats?.kd ?? player.kd;
  const headshotPct = stats?.headshotPct ?? player.headshotPct;
  const rank = player.hidden ? "Hidden" : rankName(rankValue, tier ? { [tier.tier]: tier } : {});
  const rankIcon = player.hidden
    ? hiddenTier?.smallIcon || hiddenTier?.largeIcon
    : tier?.smallIcon || tier?.largeIcon;
  const status = phase === "live" ? "Playing" : locked ? "Locked in" : selected ? "Choosing" : "Picking";

  return (
    <div className={`grid min-h-[40px] items-center px-3 ${last ? "" : "border-b border-white/[0.045]"}`} style={{ gridTemplateColumns: "minmax(205px,2fr) minmax(110px,1fr) 58px 58px 58px 64px" }}>
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="grid size-7 shrink-0 place-items-center overflow-hidden">
          {player.agentId ? <img alt="" className="size-full object-contain" src={`https://media.valorant-api.com/agents/${player.agentId}/displayicon.png`} /> : <IconUserFilled aria-hidden="true" className="size-3.5 text-zinc-600" />}
        </span>
        <span className="truncate text-[11px] font-medium text-zinc-200">{player.name}</span>
        {player.tagLine && !player.hidden && <span className="truncate text-[10px] text-zinc-500">#{player.tagLine}</span>}
        {player.level != null && <span className="shrink-0 text-[10px] text-zinc-500">Lvl {player.level}</span>}
        {player.you && <span className="shrink-0 rounded bg-white/10 px-1 text-[8px] font-semibold text-zinc-300">YOU</span>}
      </div>
      <div className="flex min-w-0 items-center gap-1.5">
        {rankIcon ? (
          <img alt="" className={`shrink-0 object-contain ${player.hidden ? "opacity-40" : ""}`} height={20} src={rankIcon} style={{ height: 20, width: 20 }} width={20} />
        ) : (
          <span className={`grid shrink-0 place-items-center rounded-full bg-white/[0.05] text-[9px] text-zinc-500 ${player.hidden ? "opacity-40" : ""}`} style={{ display: "grid", height: 20, width: 20, placeItems: "center" }}>{player.hidden ? "?" : "—"}</span>
        )}
        <span className={`truncate text-[10px] font-medium ${player.hidden || rankValue == null ? "text-zinc-500" : "text-zinc-300"}`} title={rankValue == null && !player.hidden ? "Riot did not return this player's rank" : undefined}>{rank}</span>
      </div>
      <span className="text-[10px] tabular-nums text-zinc-400">{statsLoading ? <Skeleton className="h-3 w-8" /> : games && wins != null ? `${Math.round(wins / games * 100)}%` : "—"}</span>
      <span className="text-[10px] tabular-nums text-zinc-400" title={player.you ? "Your selected recent match range" : "Last 5 completed matches"}>{statsLoading ? <Skeleton className="h-3 w-8" /> : kd?.toFixed(2) ?? "—"}</span>
      <span className="text-[10px] tabular-nums text-zinc-400" title={player.you ? "Your selected recent match range" : "Last 5 completed matches"}>{statsLoading ? <Skeleton className="h-3 w-8" /> : headshotPct == null ? "—" : `${headshotPct.toFixed(1)}%`}</span>
      {phase === "live" ? (
        <span className="text-[10px] tabular-nums text-zinc-300" title="Average combat score over the last five matches">
          {player.acs == null ? "—" : Math.round(player.acs)}
        </span>
      ) : <span className={`text-[10px] ${locked ? "text-emerald-400" : "text-zinc-500"}`}>{status}</span>}
    </div>
  );
}

function Empty({ title, detail }: { title: string; detail: string }) {
  return (
    <Glass className="flex min-h-44 items-center justify-center rounded-lg p-5 text-center">
      <div className="relative z-20 max-w-sm">
        {title === "Checking Riot Client" ? <Skeleton className="mx-auto mb-3 h-8 w-8" /> : <div className="mx-auto mb-3 size-8 rounded border border-white/[0.08] bg-white/[0.035]" />}
        <h2 className="text-xs font-medium text-zinc-200">{title}</h2>
        <p className="mt-1.5 text-[11px] leading-4 text-zinc-500">{detail}</p>
      </div>
    </Glass>
  );
}

async function read<T>(response: Response) {
  if (!response.ok) throw new Error("VALORANT catalog request failed");
  return response.json() as Promise<Catalog<T>>;
}

function resolveMap(id: string, maps: Record<string, MapInfo>) {
  const value = id.toLowerCase();
  return Object.values(maps).find((map) =>
    map.mapUrl?.toLowerCase().includes(value) || value.includes(map.displayName.toLowerCase()),
  ) ?? null;
}

function nameFromId(id: string) {
  const parts = id.split("/").filter(Boolean);
  const part = parts[parts.length - 1];
  return part?.replace(/([a-z])([A-Z])/g, (_match, lower: string, upper: string) => `${lower} ${upper}`) ?? "";
}

function displayQueue(queue: string | null, mode: string) {
  const lower = mode.toLowerCase();
  const value = queue || (
    lower.includes("swiftplay") ? "Swiftplay"
      : lower.includes("spikerush") ? "Spike Rush"
        : lower.includes("deathmatch") ? "Deathmatch"
          : lower.includes("escalation") ? "Escalation"
            : lower.includes("bomb") ? "Standard"
              : nameFromId(mode).split(/[._]/)[0]
  );
  return value ? value.replace(/[_-]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : null;
}

function rankName(tier: number | null, tiers: Record<number, Tier>, fallback = "Unavailable") {
  if (tier == null) return fallback;
  if (tier < 3) return "Unranked";
  const name = tiers[tier]?.tierName;
  if (name) return name.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
  if (tier === 27) return "Radiant";
  const names = ["Iron", "Bronze", "Silver", "Gold", "Platinum", "Diamond", "Ascendant", "Immortal"];
  const offset = tier - 3;
  return `${names[Math.floor(offset / 3)] ?? "Rank"} ${(offset % 3) + 1}`;
}

export default CurrentMatchPage;
