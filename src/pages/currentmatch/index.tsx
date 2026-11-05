import { useEffect, useMemo, useState } from "react";
import Glass from "../../components/ui/glass";
import Team from "../../components/currentmatch/team";
import Matchup from "../../components/currentmatch/matchup";
import Empty from "../../components/currentmatch/empty";
import { getMaps, getTiers, type MapInfo } from "../../components/core/catalog";
import type {
  CurrentMatch,
  MatchStatus,
  OverviewStats,
  Tier,
} from "../../components/core/types";
import { modeLabel, modeType } from "../../components/matches/modes";

type MatchProps = {
  connected: boolean;
  match: CurrentMatch | null;
  stats: OverviewStats | null;
  statsLoading: boolean;
  status: MatchStatus;
  error: string | null;
  profileLoading: boolean;
};

function CurrentMatchPage({
  connected,
  match,
  stats,
  statsLoading,
  status,
  error,
  profileLoading,
}: MatchProps) {
  const [maps, setMaps] = useState<Record<string, MapInfo>>({});
  const [tiers, setTiers] = useState<Record<number, Tier>>({});

  useEffect(() => {
    let active = true;

    async function loadCatalog() {
      const [maps, tiers] = await Promise.allSettled([getMaps(), getTiers()]);
      if (!active) return;
      if (maps.status === "fulfilled") setMaps(maps.value);
      if (tiers.status === "fulfilled") setTiers(tiers.value);
    }

    void loadCatalog();
    return () => {
      active = false;
    };
  }, []);

  const map = match ? resolveMap(match.mapId, maps) : null;
  const allies = useMemo(
    () =>
      match?.players
        .filter((player) => player.team === "ally")
        .sort((a, b) => Number(b.hidden) - Number(a.hidden)) ?? [],
    [match],
  );
  const enemies = useMemo(
    () =>
      match?.players
        .filter((player) => player.team === "enemy")
        .sort((a, b) => Number(b.hidden) - Number(a.hidden)) ?? [],
    [match],
  );
  const me = match?.players.find((player) => player.you);
  const profilesPending =
    profileLoading &&
    [...allies, ...enemies].some(
      (player) =>
        !player.hidden &&
        player.kd == null &&
        player.headshotPct == null &&
        player.acs == null,
    );
  const phase = match?.phase === "pregame" ? "Agent Select" : null;
  const queue = match ? displayQueue(match.queueId, match.modeId) : null;
  const playerLimit = queue && modeType(queue) === "deathmatch" ? 12 : 10;

  return (
    <div className="flex h-full flex-col overflow-y-auto px-4 pb-4 pt-11 [scrollbar-color:rgba(255,255,255,0.18)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/15 [&::-webkit-scrollbar-thumb:hover]:bg-white/25 [&::-webkit-scrollbar-track]:bg-transparent">
      <div
        className={`w-full ${match ? "space-y-2.5" : "flex flex-1 items-center justify-center"}`}
      >
        {!connected && !match ? (
          <Empty title="" detail="Launch VALORANT to show stats" loading />
        ) : status === "checking" && !match ? (
          <Empty title="" detail="" loading />
        ) : status === "error" && !match ? (
          <Empty
            title="Couldn’t load the match"
            detail={error ?? "Riot Client match data is unavailable."}
          />
        ) : !match ? (
          <Empty
            title={
              connected
                ? "You’re not playing a game right now"
                : "Launch VALORANT"
            }
            detail={
              connected
                ? "Queue up in VALORANT or join a lobby. Your current match will show here."
                : "Launch VALORANT to show stats and your current match."
            }
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
                  <p className="truncate text-sm font-medium text-white">
                    {map?.displayName ??
                      (nameFromId(match.mapId) || "Current match")}
                  </p>
                  <p className="mt-0.5 text-[10px] text-zinc-400">
                    {queue ?? "Mode unavailable"}
                    {phase && (
                      <>
                        <span className="px-1 text-zinc-600">·</span>
                        {phase}
                      </>
                    )}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs font-medium text-zinc-200">
                    {me?.name ?? "Player"}
                    {me?.tagLine ? (
                      <span className="text-zinc-500">#{me.tagLine}</span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-[10px] text-zinc-500">
                    {match.players.length} / {playerLimit} players
                  </p>
                </div>
              </div>
            </Glass>

            <div className="space-y-2.5">
              <Team
                title="Your team"
                side="ally"
                matchId={match.matchId}
                phase={match.phase}
                players={allies}
                stats={stats}
                statsLoading={statsLoading}
                profileLoading={profileLoading}
                tiers={tiers}
                ownTier={stats?.currentTier ?? null}
              />
              <Team
                title="Enemy team"
                side="enemy"
                matchId={match.matchId}
                phase={match.phase}
                players={enemies}
                stats={null}
                statsLoading={false}
                profileLoading={profileLoading}
                tiers={tiers}
                ownTier={null}
              />
              <Matchup
                allies={allies}
                enemies={enemies}
                loading={profilesPending}
              />
            </div>
            {match.players.length === 0 && (
              <Glass className="rounded-lg p-3">
                <p className="relative z-20 text-xs text-zinc-400">
                  Riot hasn’t returned the player roster yet.
                </p>
              </Glass>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function resolveMap(id: string, maps: Record<string, MapInfo>) {
  const value = id.toLowerCase();
  return (
    Object.values(maps).find(
      (map) =>
        map.mapUrl?.toLowerCase().includes(value) ||
        value.includes(map.displayName.toLowerCase()),
    ) ?? null
  );
}

function nameFromId(id: string) {
  const parts = id.split("/").filter(Boolean);
  const part = parts[parts.length - 1];
  return (
    part?.replace(
      /([a-z])([A-Z])/g,
      (_match, lower: string, upper: string) => `${lower} ${upper}`,
    ) ?? ""
  );
}

function displayQueue(queue: string | null, mode: string) {
  const queueType = modeType(queue);
  if (queueType !== "other" && queueType !== "standard") return modeLabel(queue);
  const modeTypeValue = modeType(mode);
  if (modeTypeValue !== "other" && modeTypeValue !== "standard")
    return modeLabel(mode);
  if (queueType === "standard" || modeTypeValue === "standard")
    return "Standard";
  return modeLabel(queue || mode);
}

export default CurrentMatchPage;
