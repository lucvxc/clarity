import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { IconCircleArrowDownFilled, IconCircleArrowUpFilled, IconTargetArrow } from "@tabler/icons-react";
import Glass from "../ui/glass";
import Select from "../ui/select";
import Spinner from "../ui/spinner";
import { getMaps, type MapInfo } from "../core/catalog";
import type { RecentMatch, StatsStatus, Tier } from "../core/types";
import { modeLabel, modeType } from "./modes";
import { prefetchDetails } from "./data";

const GAME_TYPES = [
  { label: "All game types", value: "all" },
  { label: "Competitive", value: "competitive" },
  { label: "Unrated", value: "unrated" },
  { label: "Swiftplay", value: "swiftplay" },
  { label: "Spike Rush", value: "spikerush" },
  { label: "Deathmatch", value: "deathmatch" },
  { label: "Team Deathmatch", value: "teamdeathmatch" },
  { label: "Skirmish", value: "skirmish" },
];

const MODES: Record<string, string> = {
  standard: "96bd3920-4f36-d026-2b28-c683eb0bcac5",
  swiftplay: "5d0f264b-4ebe-cc63-c147-809e1374484b",
  spikerush: "e921d1e6-416b-c31f-1291-74930c330b7b",
  deathmatch: "a8790ec5-4237-f2f0-e93b-08a8e89865b2",
  teamdeathmatch: "e086db66-47fd-e791-ca81-06a645ac7661",
  skirmish: "0e9805d8-4af6-5ffb-f467-55806a6bc484",
};

const MODE_NAMES: Record<string, string> = {
  [MODES.standard]: "Standard",
  [MODES.swiftplay]: "Swiftplay",
  [MODES.spikerush]: "Spike Rush",
  [MODES.deathmatch]: "Deathmatch",
  [MODES.teamdeathmatch]: "Team Deathmatch",
};
const DATE = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const UUID = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i;

type Props = {
  matches: RecentMatch[];
  status: StatsStatus;
  detail: string;
  tiers: Record<number, Tier>;
  limit?: number;
  title?: string;
  hasMore?: boolean;
  subject?: string;
};

function MatchList({
  matches,
  status,
  detail,
  limit = 5,
  title = "Recent matches",
  hasMore = false,
  subject,
  tiers,
}: Props) {
  const [filter, setFilter] = useState("all");
  const [maps, setMaps] = useState<Record<string, MapInfo>>({});
  const navigate = useNavigate();
  const list = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);
  const filtered = matches
    .filter((match) => filter === "all" || gameType(match) === filter)
    .slice(0, limit);

  function open(match: RecentMatch) {
    try {
      sessionStorage.setItem(`clarity:match:${match.matchId}`, JSON.stringify({ match, subject }));
    } catch {}
    navigate(`/matchhistory/${match.matchId}`, { state: { match, subject } });
  }

  useEffect(() => {
    let active = true;
    getMaps()
      .then((value) => {
        if (active) setMaps(value);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    list.current?.animate(
      [
        { opacity: 0, transform: "translateY(5px)" },
        { opacity: 1, transform: "translateY(0)" },
      ],
      { duration: 180, easing: "ease-out" },
    );
  }, [filter]);

  const selector = (
    <Select
      label="Game type"
      value={filter}
      options={GAME_TYPES}
      onChange={setFilter}
    />
  );
  const rows =
    status === "checking" ? (
      <div
        className="flex items-center justify-center"
        style={{ height: `${Math.max(1, Math.min(limit || 5, 5)) * 78}px` }}
      >
        <Spinner label="Loading matches" />
      </div>
    ) : filtered.length ? (
      filtered.map((match, index) => (
        <RecentRow
          key={match.matchId || `${match.started ?? "match"}-${index}`}
          match={match}
          mapImage={mapImage(match.mapId, maps)}
          mapName={mapName(match.mapId, maps)}
          tiers={tiers}
          onOpen={open}
          onPrefetch={prefetchDetails}
        />
      ))
    ) : (
      <p className="px-3.5 py-5 text-[11px] text-zinc-500">
        {matches.length
          ? hasMore
            ? "No loaded matches for this game type yet"
            : "No matches found for this game type"
          : detail}
      </p>
    );

  return (
    <div className={title ? "" : "space-y-2"}>
      {title ? (
        <Glass className="rounded-lg p-0">
          <div className="relative z-20">
            <div className="flex items-center justify-between border-b border-white/[0.08] px-3.5 py-2.5">
              <h2 className="text-xs font-medium text-zinc-200">{title}</h2>
              {selector}
            </div>
            <div ref={list}>{rows}</div>
          </div>
        </Glass>
      ) : (
        <>
          <div className="flex justify-end">{selector}</div>
          <Glass className="rounded-lg p-0">
            <div className="relative z-20" ref={list}>
              {rows}
            </div>
          </Glass>
        </>
      )}
    </div>
  );
}

function RecentRow({
  match,
  mapImage,
  mapName: map,
  tiers,
  onOpen,
  onPrefetch,
}: {
  match: RecentMatch;
  mapImage: string | null;
  mapName: string;
  tiers: Record<number, Tier>;
  onOpen: (match: RecentMatch) => void;
  onPrefetch: (id: string) => void;
}) {
  const [mapLoaded, setMapLoaded] = useState(false);
  const [modeFailed, setModeFailed] = useState(false);
  const rounds =
    match.roundsWon != null && match.roundsLost != null
      ? `${match.roundsWon}-${match.roundsLost}`
      : "—";
  const result =
    match.won == null
      ? "border-l-white/10 bg-[#18201f]"
      : match.won
        ? "border-l-[#25e0ba] bg-[#082c29]"
        : "border-l-[#ff4655] bg-[#351a20]";
  const ranked = gameType(match) === "competitive";
  const type = queueName(match);
  const tier = tiers[match.tier ?? 0] ?? tiers[0];
  const iconUrl = ranked ? (tier?.smallIcon || tier?.largeIcon) : gameModeIcon(match);
  const date = match.started == null ? "VALORANT match" : formatDate(match.started);

  return (
    <button
      aria-label={`View ${type} match on ${map}`}
      className={`relative isolate flex h-[78px] w-full items-stretch overflow-hidden border-b border-l-[3px] border-white/[0.05] text-left [content-visibility:auto] transition-[filter] hover:brightness-125 focus-visible:z-20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-white/60 disabled:cursor-default ${result}`}
      disabled={!match.matchId}
      onClick={() => onOpen(match)}
      onFocus={() => onPrefetch(match.matchId)}
      onMouseEnter={() => onPrefetch(match.matchId)}
      title={`${date} · ${map} · ${type}`}
    >
      {mapImage && (
        <img
          alt=""
          aria-hidden="true"
          className={`pointer-events-none absolute inset-y-0 right-0 h-full w-[48%] object-cover object-center transition-opacity duration-500 [mask-image:linear-gradient(to_right,transparent,black_48%)] ${mapLoaded ? "opacity-55" : "opacity-0"}`}
          decoding="async"
          loading="lazy"
          onLoad={() => setMapLoaded(true)}
          src={mapImage}
        />
      )}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-black/20"
      />
      <div className="relative z-10 flex w-[74px] shrink-0 items-center justify-center p-1">
        {match.agentId ? (
          <img
            alt=""
            className="size-full object-cover"
            decoding="async"
            loading="lazy"
            src={`https://media.valorant-api.com/agents/${match.agentId}/displayicon.png`}
          />
        ) : (
          <div className="size-full bg-white/[0.04]" />
        )}
      </div>
      <div className="relative z-10 flex w-[72px] shrink-0 flex-col items-center justify-center gap-0.5 border-r border-white/[0.06] px-1">
        {iconUrl && (ranked || !modeFailed) ? (
          <img
            alt=""
            className="size-8 object-contain opacity-90"
            decoding="async"
            loading="lazy"
            onError={() => { if (!ranked) setModeFailed(true); }}
            src={iconUrl}
          />
        ) : ranked ? (
          <span className="size-8 animate-pulse rounded-full bg-white/10" />
        ) : (
          <IconTargetArrow
            aria-hidden="true"
            className="size-7 text-white/65"
            stroke={1.6}
          />
        )}
        {ranked && match.rr != null && (
          <span
            className={`flex items-center gap-0.5 text-[10px] font-medium tabular-nums ${match.rr >= 0 ? "text-[#25e0ba]" : "text-[#ff4655]"}`}
          >
            {match.rr > 0 ? "+" : ""}{match.rr} RR
            {match.rankChange != null && match.rankChange > 0 && <IconCircleArrowUpFilled aria-label="Ranked up" className="size-3" />}
            {match.rankChange != null && match.rankChange < 0 && <IconCircleArrowDownFilled aria-label="Deranked" className="size-3" />}
          </span>
        )}
        <span className="max-w-full truncate text-[8px] font-medium uppercase tracking-wide text-white/55">
          {type}
        </span>
      </div>
      <div className="relative z-10 flex w-[145px] shrink-0 flex-col justify-center px-3">
        <span className="text-[10px] tracking-wide text-white/45">KDA</span>
        <span className="text-[13px] tabular-nums text-zinc-100">
          {match.kills ?? 0} / {match.deaths ?? 0} / {match.assists ?? 0}
        </span>
        <span className="mt-0.5 w-fit bg-black/20 px-1.5 py-0.5 text-[9px] leading-none tracking-wide text-white/65">
          SCORE&nbsp; {match.score == null ? "—" : match.score.toLocaleString()}
        </span>
      </div>
      <div className="relative z-10 flex min-w-0 flex-1 flex-col items-center justify-center px-2 text-center">
        <span
          className={`text-[15px] font-semibold leading-5 ${match.won ? "text-[#25e0ba]" : match.won === false ? "text-[#ff4655]" : "text-white/60"}`}
        >
          {match.won ? "VICTORY" : match.won === false ? "DEFEAT" : "COMPLETE"}
        </span>
        <span className="text-[13px] tabular-nums text-white/75">{rounds}</span>
      </div>
      <div className="relative z-10 flex w-[100px] shrink-0 items-center justify-end px-3">
        {(match.matchMvp || match.mvp) && (
          <span
            className={`whitespace-nowrap text-[9px] font-semibold sm:text-[10px] ${match.matchMvp ? "text-amber-200" : "text-white"}`}
          >
            {match.matchMvp ? "MATCH MVP" : "TEAM MVP"}
          </span>
        )}
      </div>
    </button>
  );
}

function mapImage(id: string, maps: Record<string, MapInfo>) {
  const value = (id ?? "").toLowerCase().replace(/\/$/, "");
  const parts = value.split("/").filter(Boolean);
  const key = parts[parts.length - 1] ?? value;
  const map = Object.values(maps).find((item) => {
    const url = item.mapUrl?.toLowerCase().replace(/\/$/, "");
    const path = url?.split("/").filter(Boolean) ?? [];
    const last = path[path.length - 1];
    const name = item.displayName.toLowerCase().replace(/[^a-z0-9]/g, "");
    const tail = key.replace(/[^a-z0-9]/g, "");
    return (
      item.uuid.toLowerCase() === value ||
      value.includes(item.uuid.toLowerCase()) ||
      (url != null && (value.includes(url) || url.includes(value))) ||
      last === key ||
      name === tail
    );
  });
  if (map?.splash) return map.splash;
  return UUID.test(value)
    ? `https://media.valorant-api.com/maps/${value}/splash.png`
    : null;
}

function gameModeIcon(match: RecentMatch) {
  const source = match.mode?.trim() ?? "";
  const kind = gameType(match);
  const id = kind === "skirmish"
    ? MODES.skirmish
    : UUID.test(source)
      ? source
      : (MODES[kind] ??
      (kind === "unrated" || kind === "competitive"
        ? MODES.standard
        : undefined));
  return id
    ? `https://media.valorant-api.com/gamemodes/${id}/displayicon.png`
    : null;
}

function gameType(match: RecentMatch) {
  if (match.competitive || match.rr != null || match.tier != null)
    return "competitive";

  const queue = modeType(match.queue);
  if (queue !== "other" && queue !== "standard") return queue;
  const mode = modeType(match.mode);
  if (mode !== "other" && mode !== "standard") return mode;
  if (queue === "standard" || mode === "standard") return "standard";
  return queue !== "other" ? queue : mode;
}

function queueName(match: RecentMatch) {
  const source = match.queue?.trim() || match.mode?.trim() || "";
  const kind = gameType(match);
  if (kind === "competitive") return "Competitive";
  const name = MODE_NAMES[source.toLowerCase()];
  const fallback = UUID.test(source) ? "Game mode" : source || "VALORANT";
  const names: Record<string, string> = {
    unrated: "Unrated",
    standard: "Standard",
    swiftplay: "Swiftplay",
    spikerush: "Spike Rush",
    deathmatch: "Deathmatch",
    teamdeathmatch: "Team Deathmatch",
    skirmish: "Skirmish",
    other: fallback,
  };
  return name ?? (kind === "other" ? modeLabel(source) : names[kind]);
}

function mapName(id: string, maps: Record<string, MapInfo>) {
  const value = (id ?? "").toLowerCase();
  const matched = Object.values(maps).find(
    (map) =>
      map.uuid.toLowerCase() === value ||
      map.mapUrl?.toLowerCase().includes(value) ||
      value.includes(map.uuid.toLowerCase()),
  );
  if (matched) return matched.displayName;
  const key = (value.split("/").filter(Boolean).pop() ?? "").toLowerCase();
  const names: Record<string, string> = {
    triad: "Haven",
    duality: "Bind",
    port: "Ascent",
    bonsai: "Split",
    foxtrot: "Breeze",
    canyon: "Fracture",
    pitt: "Pearl",
    jam: "Lotus",
    juliett: "Sunset",
    infinity: "Abyss",
    juliett2: "Corrode",
  };
  return names[key] ?? (key.replace(/([a-z])([A-Z])/g, "$1 $2") || "VALORANT");
}

function formatDate(value: number) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "VALORANT match" : DATE.format(date);
}

export default MatchList;
