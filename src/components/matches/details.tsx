import { IconArrowLeft, IconUserFilled } from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { getMaps, type MapInfo } from "../core/catalog";
import { rankName } from "../core/rank";
import type { MatchDetails as MatchData, RecentMatch, Tier } from "../core/types";
import Glass from "../ui/glass";
import Skeleton from "../ui/skeleton";
import You from "../ui/you";
import PlayerLink from "../ui/playerlink";
import { getCachedDetails, getDetails } from "./data";
import { modeLabel, modeType } from "./modes";

const COLUMNS = "minmax(205px,2fr) minmax(110px,1fr) 55px 45px 45px 45px 58px 64px";
const NO_HS_COLUMNS = "minmax(205px,2fr) minmax(110px,1fr) 55px 45px 45px 45px 64px";

type Props = {
  match: RecentMatch;
  tiers: Record<number, Tier>;
  subject?: string;
};

function MatchDetails({ match, tiers, subject }: Props) {
  const navigate = useNavigate();
  const [loaded, setLoaded] = useState(() => {
    const value = getCachedDetails(match.matchId);
    return value ? { id: match.matchId, value } : null;
  });
  const data = loaded?.id === match.matchId
    ? loaded.value
    : getCachedDetails(match.matchId) ?? null;
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(() => !getCachedDetails(match.matchId));
  const [maps, setMaps] = useState<Record<string, MapInfo>>({});

  useEffect(() => {
    let active = true;
    setError(null);
    setLoading(true);
    const value = getCachedDetails(match.matchId);
    if (value) setLoaded({ id: match.matchId, value });
    getDetails(match.matchId)
      .then((detail) => {
        if (active) setLoaded({ id: match.matchId, value: detail });
      })
      .catch(() => {
        if (active) setError("Could not load this match’s player stats.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [match.matchId]);

  useEffect(() => {
    let active = true;
    void getMaps()
      .then((value) => {
        if (active) setMaps(value);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const map = useMemo(() => findMap(data?.mapId ?? match.mapId, maps), [data, maps, match.mapId]);
  const own = data?.players.find((player) => subject ? player.subject === subject : player.you);
  const rounds = !subject && data?.roundsWon != null && data.roundsLost != null
    ? `${data.roundsWon} : ${data.roundsLost}`
    : match.roundsWon != null && match.roundsLost != null
      ? `${match.roundsWon} : ${match.roundsLost}`
      : "—";
  const queue = data?.queue ?? match.queue;
  const mode = data?.mode ?? match.mode;
  const gameType = modeType(queue) === "other" ? mode || queue : queue;
  const fallbackShots = {
    headshots: match.headshots ?? 0,
    bodyshots: match.bodyshots ?? 0,
    legshots: match.legshots ?? 0,
  };
  const hasDetailShots = Boolean(
    own && own.headshots + own.bodyshots + own.legshots > 0,
  );
  const ownShots = hasDetailShots
    ? {
        headshots: own?.headshots ?? 0,
        bodyshots: own?.bodyshots ?? 0,
        legshots: own?.legshots ?? 0,
      }
    : subject ? { headshots: 0, bodyshots: 0, legshots: 0 } : fallbackShots;
  const ownHeadshots = ownShots.headshots;
  const ownBodyshots = ownShots.bodyshots;
  const ownLegshots = ownShots.legshots;
  const ownHits = ownHeadshots + ownBodyshots + ownLegshots;
  const ownHs = ownHits ? `${((ownHeadshots / ownHits) * 100).toFixed(1)}%` : "N/A";
  const ownKd = own ? (own.deaths ? (own.kills / own.deaths).toFixed(2) : own.kills.toFixed(2)) : "—";
  const deathmatch = [queue, mode, match.queue, match.mode].some(
    (value) => modeType(value) === "deathmatch",
  );
  const showHs = !deathmatch;
  const groups = data ? groupPlayers(data.players, gameType, subject) : [];
  const result = match.won == null ? "Match complete" : match.won ? "Victory" : "Defeat";
  const resultColor = match.won == null ? "text-zinc-300" : match.won ? "text-emerald-400" : "text-rose-400";

  return (
    <div className="h-full overflow-y-auto px-4 pb-5 pt-11 [scrollbar-color:rgba(255,255,255,0.18)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/15 [&::-webkit-scrollbar-thumb:hover]:bg-white/25 [&::-webkit-scrollbar-track]:bg-transparent">
      <div className="mx-auto max-w-6xl space-y-3">
        <button
          className="flex items-center gap-2 text-xs text-zinc-400 transition-colors hover:text-white"
          onClick={() => navigate(-1)}
          type="button"
        >
          <IconArrowLeft aria-hidden="true" className="size-4" />
          Back
        </button>

        <Glass className="relative rounded-lg p-3">
          {map?.splash && (
            <img alt="" aria-hidden="true" className="pointer-events-none absolute inset-0 size-full object-cover opacity-25" src={map.splash} />
          )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/85 via-black/65 to-black/35" />
          <div className="relative z-20 flex min-h-12 items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white">{map?.displayName ?? "Match"}</p>
              <p className="mt-0.5 truncate text-[10px] text-zinc-400">
                {modeLabel(gameType)}
                {data?.started != null && <><span className="px-1 text-zinc-600">·</span>{new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(data.started))}</>}
                {data?.duration != null && <><span className="px-1 text-zinc-600">·</span>{formatDuration(data.duration)}</>}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className={`text-xs font-medium ${resultColor}`}>{result}</p>
              <p className="mt-0.5 text-[10px] tabular-nums text-zinc-500">{rounds.replace(" : ", "–")}</p>
            </div>
          </div>
        </Glass>

        {error && <Glass className="p-4"><p className="relative z-20 text-xs text-rose-300">{error}</p></Glass>}
        {data && (
          <>
            <div className={`grid grid-cols-2 gap-2 sm:grid-cols-3 ${showHs ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}>
              <Summary label="K / D / A" value={own ? `${own.kills} / ${own.deaths} / ${own.assists}` : "—"} />
              <Summary label="K/D" value={ownKd} />
              <Summary label="ACS" value={own ? String(acs(own.score, own.rounds)) : "—"} />
              {showHs && <Summary label="Headshot %" value={ownHs} />}
              <Summary label="Score" value={own?.score.toLocaleString() ?? "—"} />
            </div>
            <div className="space-y-2.5">
              {groups.map(({ name, players, own: ownTeam }) => (
                <Scoreboard key={name} name={name} players={players} tiers={tiers} showHs={showHs} fallbackShots={fallbackShots} own={ownTeam} />
              ))}
            </div>
          </>
        )}
        {!data && !error && loading && <MatchSkeleton showHs={showHs} />}
      </div>
    </div>
  );
}

function Summary({
  label,
  value,
  color = "text-white",
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <Glass className="rounded-lg px-3 py-2.5">
      <div className="relative z-20">
        <p className="text-[9px] text-zinc-500">{label}</p>
        <p className={`mt-1 truncate text-sm font-semibold tabular-nums ${color}`}>{value}</p>
      </div>
    </Glass>
  );
}

function Scoreboard({
  name,
  players,
  tiers,
  fallbackShots,
  showHs,
  own,
}: {
  name: string;
  players: MatchData["players"];
  tiers: Record<number, Tier>;
  fallbackShots: { headshots: number; bodyshots: number; legshots: number };
  showHs: boolean;
  own: boolean;
}) {
  const columns = showHs
    ? "minmax(205px,2fr) minmax(110px,1fr) 58px 48px 48px 48px 64px 70px"
    : "minmax(205px,2fr) minmax(110px,1fr) 58px 48px 48px 48px 70px";

  return (
    <Glass className="rounded-lg p-0">
      <div className="relative z-20">
        <div className="flex items-center justify-between border-b border-white/[0.07] px-3 py-2">
          <h2 className="flex items-center gap-2 text-[13px] font-medium text-zinc-100">
            <IconUserFilled aria-hidden="true" className={`size-4 ${own ? "text-emerald-400" : "text-rose-400"}`} />
            {name}
          </h2>
          <span className="text-[11px] tabular-nums text-zinc-500">{players.length} players</span>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[760px]">
            <div className="grid border-b border-white/[0.055] px-3 py-1.5 text-[11px] font-medium text-zinc-500" style={{ gridTemplateColumns: columns }}>
              <span>Player</span>
              <span>Rank</span>
              <span className="text-right">ACS</span>
              <span className="text-right">K</span>
              <span className="text-right">D</span>
              <span className="text-right">A</span>
              {showHs && <span className="text-right">HS %</span>}
              <span className="text-right">Score</span>
            </div>
            {players.slice().sort((a, b) => b.score - a.score).map((player, index) => (
              <PlayerRow
                key={player.subject}
                player={player}
                tiers={tiers}
                fallbackShots={fallbackShots}
                showHs={showHs}
                last={index === players.length - 1}
              />
            ))}
          </div>
        </div>
      </div>
    </Glass>
  );
}

function MatchSkeleton({ showHs }: { showHs: boolean }) {
  return (
    <>
      <div className={`mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 ${showHs ? "lg:grid-cols-6" : "lg:grid-cols-5"}`}>
        {Array.from({ length: showHs ? 6 : 5 }, (_, index) => (
          <Glass key={index} className="rounded-lg px-3 py-2.5">
            <div className="relative z-20 space-y-1.5">
              <Skeleton className="h-2.5 w-14" />
              <Skeleton className="h-4 w-16" />
            </div>
          </Glass>
        ))}
      </div>
      <div className="space-y-3">
        {[0, 1].map((team) => (
          <Glass key={team} className="rounded-lg p-0">
            <div className="relative z-20">
              <div className="flex items-center justify-between border-b border-white/[0.07] px-3 py-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-2.5 w-12" />
              </div>
              <div className="overflow-x-auto">
                <div className="min-w-[760px]">
                  <div
                    className="grid border-b border-white/[0.055] px-3 py-1.5"
                    style={{ gridTemplateColumns: showHs ? COLUMNS : NO_HS_COLUMNS }}
                  >
                    {Array.from({ length: showHs ? 8 : 7 }, (_, index) => (
                      <Skeleton key={index} className="h-2.5 w-8" />
                    ))}
                  </div>
                  {Array.from({ length: 5 }, (_, index) => (
                    <div
                      key={index}
                      className="grid min-h-[40px] items-center px-3"
                      style={{ gridTemplateColumns: COLUMNS }}
                    >
                      <div className="flex items-center gap-2">
                        <Skeleton className="size-7 rounded-sm" />
                        <Skeleton className="h-2.5 w-20" />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Skeleton className="size-5 rounded-full" />
                        <Skeleton className="h-2.5 w-14" />
                      </div>
                      {Array.from({ length: showHs ? 6 : 5 }, (_, stat) => (
                        <Skeleton key={stat} className="ml-auto h-2.5 w-7" />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Glass>
        ))}
      </div>
    </>
  );
}

function PlayerRow({
  player,
  tiers,
  fallbackShots,
  showHs,
  last,
}: {
  player: MatchData["players"][number];
  tiers: Record<number, Tier>;
  fallbackShots: { headshots: number; bodyshots: number; legshots: number };
  showHs: boolean;
  last: boolean;
}) {
  const rankTier = player.tier ?? 0;
  const rank = tiers[rankTier];
  const detailHits = player.headshots + player.bodyshots + player.legshots;
  const useFallback = player.you && detailHits === 0;
  const headshots = useFallback ? fallbackShots.headshots : player.headshots;
  const bodyshots = useFallback ? fallbackShots.bodyshots : player.bodyshots;
  const legshots = useFallback ? fallbackShots.legshots : player.legshots;
  const hits = headshots + bodyshots + legshots;
  const hs = hits ? `${((headshots / hits) * 100).toFixed(1)}%` : "N/A";
  return (
    <div
      className={`grid min-h-[40px] items-center px-3 ${last ? "" : "border-b border-white/[0.045]"} ${player.you ? "bg-white/[0.035]" : ""}`}
      style={{ gridTemplateColumns: showHs ? COLUMNS : NO_HS_COLUMNS }}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="grid size-7 shrink-0 place-items-center overflow-hidden">
          {player.agentId ? (
            <img
              alt=""
              className="size-full object-contain"
              loading="lazy"
              src={`https://media.valorant-api.com/agents/${player.agentId}/displayicon.png`}
            />
          ) : (
            <IconUserFilled aria-hidden="true" className="size-3.5 text-zinc-600" />
          )}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[11px] font-medium text-zinc-100">
            <PlayerLink subject={player.subject} name={player.name} tagLine={player.tagLine} level={player.level} tier={player.tier} playerCardId={player.playerCardId} />
            {player.you && <You className="ml-1.5" />}
          </p>
          <p className="text-[9px] text-zinc-500">{player.level != null ? `Lvl ${player.level}` : "Player"}</p>
        </div>
      </div>
      <div
        className="flex min-w-0 items-center gap-1.5"
        title={player.hidden ? "Player rank is hidden" : undefined}
      >
        {player.hidden ? (
          tiers[0]?.smallIcon || tiers[0]?.largeIcon ? (
            <img
              alt=""
              className="size-5 shrink-0 object-contain opacity-40"
              loading="lazy"
              src={tiers[0]?.smallIcon || tiers[0]?.largeIcon || undefined}
            />
          ) : (
            <span className="grid size-5 shrink-0 place-items-center rounded-full bg-white/[0.05] text-[9px] text-zinc-500 opacity-40">
              ?
            </span>
          )
        ) : rank?.smallIcon || rank?.largeIcon ? (
          <img
            alt=""
            className="size-5 shrink-0 object-contain"
            loading="lazy"
            src={rank.smallIcon || rank.largeIcon || undefined}
          />
        ) : (
          <span className="grid size-5 shrink-0 place-items-center rounded-full bg-white/[0.05] text-[9px] text-zinc-500">
            —
          </span>
        )}
        <span
          className={`truncate text-[10px] font-medium ${player.hidden || rankTier < 3 ? "text-zinc-500" : "text-zinc-300"}`}
        >
          {player.hidden ? "Hidden" : rankName(rankTier, tiers)}
        </span>
      </div>
      <Stat value={acs(player.score, player.rounds)} />
      <Stat value={player.kills} />
      <Stat value={player.deaths} />
      <Stat value={player.assists} />
      {showHs && <Stat value={hs} />}
      <Stat value={player.score.toLocaleString()} />
    </div>
  );
}

function Stat({ value }: { value: number | string }) {
  return <span className="text-right text-[10px] tabular-nums text-zinc-400">{value}</span>;
}

function groupPlayers(players: MatchData["players"], mode: string | null, subject?: string) {
  if (modeType(mode) === "deathmatch") {
    return [{ name: "Players", players, own: true }];
  }

  const groups = new Map<string, MatchData["players"]>();
  for (const player of players) {
    const team = player.team || "Players";
    groups.set(team, [...(groups.get(team) ?? []), player]);
  }
  const ownTeam = players.find((player) => subject ? player.subject === subject : player.you)?.team;
  const entries = [...groups.entries()].sort(([first], [second]) => {
    if (first === ownTeam) return -1;
    if (second === ownTeam) return 1;
    return first.localeCompare(second);
  });
  return entries.map(([team, roster], index) => ({
    name:
      entries.length === 2 && ownTeam
        ? team === ownTeam
          ? "Your Team"
          : "Enemy Team"
        : `Team ${index + 1}`,
    players: roster,
    own: team === ownTeam,
  }));
}

function findMap(id: string, maps: Record<string, MapInfo>) {
  const value = id.toLowerCase();
  return Object.values(maps).find(
    (map) =>
      map.uuid.toLowerCase() === value ||
      map.mapUrl?.toLowerCase().includes(value) ||
      value.includes(map.uuid.toLowerCase()),
  );
}

function acs(score: number, rounds: number) {
  return rounds > 0 ? Math.round(score / rounds) : 0;
}

function formatDuration(value: number) {
  const total = Math.round(value / 1000);
  return `${Math.floor(total / 60)}m ${String(total % 60).padStart(2, "0")}s`;
}

export default MatchDetails;
