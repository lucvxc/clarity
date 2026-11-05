import { useState } from "react";
import { IconChevronDown, IconUserFilled, IconUsersGroup } from "@tabler/icons-react";
import Glass from "../ui/glass";
import Skeleton from "../ui/skeleton";
import You from "../ui/you";
import PlayerLink from "../ui/playerlink";
import { rankName } from "../core/rank";
import type { MatchPlayer, OverviewStats, Tier } from "../core/types";
import Loadout from "./loadout";

const columns = "minmax(205px,2fr) minmax(110px,1fr) 58px 58px 58px 64px 32px";

type TeamProps = {
  title: string;
  side: "ally" | "enemy";
  matchId: string;
  phase: "live" | "pregame";
  players: MatchPlayer[];
  stats: OverviewStats | null;
  statsLoading: boolean;
  profileLoading: boolean;
  tiers: Record<number, Tier>;
  ownTier: number | null;
};

function Team({
  title,
  side,
  matchId,
  phase,
  players,
  stats,
  statsLoading,
  profileLoading,
  tiers,
  ownTier,
}: TeamProps) {
  const [open, setOpen] = useState<string | null>(null);
  const locked = players.filter((player) =>
    player.selection?.toLowerCase().includes("lock"),
  ).length;

  return (
    <Glass className="rounded-lg p-0">
      <div className="relative z-20">
        <div className="flex items-center justify-between border-b border-white/[0.07] px-3 py-2">
          <h2 className="flex items-center gap-2 text-[13px] font-medium text-zinc-100">
            <IconUserFilled
              aria-hidden="true"
              className={`size-4 ${side === "ally" ? "text-emerald-400" : "text-rose-400"}`}
            />
            {title}
          </h2>
          <span className="text-[11px] tabular-nums text-zinc-500">
            {phase === "live"
              ? "In match"
              : `${locked}/${players.length} locked in`}
          </span>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[620px]">
            <div
              className="grid border-b border-white/[0.055] px-3 py-1.5 text-[11px] font-medium text-zinc-500"
              style={{ gridTemplateColumns: columns }}
            >
              <span>Player</span>
              <span>Rank</span>
              <span>Win %</span>
              <span>K/D</span>
              <span>HS %</span>
              <span>{phase === "live" ? "ACS" : "Status"}</span>
              <span>{phase === "live" ? "Kit" : ""}</span>
            </div>
            {players.length ? (
              players.map((player, index) => (
                <PlayerRow
                  key={`${player.name}-${player.tagLine ?? index}`}
                  player={player}
                  phase={phase}
                  stats={player.you ? stats : null}
                  statsLoading={
                    player.you
                      ? statsLoading &&
                        stats == null &&
                        player.kd == null &&
                        player.headshotPct == null &&
                        player.acs == null
                      : profileLoading &&
                        !player.hidden &&
                        player.kd == null &&
                        player.headshotPct == null &&
                        player.acs == null
                  }
                  tier={
                    tiers[
                      player.you && ownTier != null && ownTier >= 3
                        ? ownTier
                        : (player.tier ?? -1)
                    ]
                  }
                  hiddenTier={tiers[0]}
                  rankValue={
                    player.you && ownTier != null && ownTier >= 3
                      ? ownTier
                      : player.tier
                  }
                  last={index === players.length - 1}
                  expanded={open === player.subject}
                  matchId={matchId}
                  onToggle={() => setOpen((current) => current === player.subject ? null : player.subject)}
                />
              ))
            ) : (
              <p className="px-3 py-4 text-[11px] text-zinc-500">
                Team roster unavailable
              </p>
            )}
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
  expanded,
  matchId,
  onToggle,
}: {
  player: MatchPlayer;
  phase: "live" | "pregame";
  stats: OverviewStats | null;
  statsLoading: boolean;
  tier?: Tier;
  hiddenTier?: Tier;
  rankValue: number | null;
  last: boolean;
  expanded: boolean;
  matchId: string;
  onToggle: () => void;
}) {
  const locked = player.selection?.toLowerCase().includes("lock") ?? false;
  const selected = Boolean(player.agentId);
  const games = stats?.games ?? player.games;
  const wins = stats?.wins ?? player.wins;
  const kd = stats?.kd ?? player.kd;
  const headshotPct = stats?.headshotPct ?? player.headshotPct;
  const rank = player.hidden
    ? "Hidden"
    : rankName(rankValue ?? 0, tier ? { [tier.tier]: tier } : {});
  const icon = player.hidden
    ? hiddenTier?.smallIcon || hiddenTier?.largeIcon
    : tier?.smallIcon || tier?.largeIcon || (rankValue == null ? hiddenTier?.smallIcon || hiddenTier?.largeIcon : undefined);
  const status = locked ? "Locked in" : selected ? "Choosing" : "Picking";

  return (
    <>
      <div
        className={`grid min-h-[40px] items-center px-3 ${last && !expanded ? "" : "border-b border-white/[0.045]"}`}
        style={{ gridTemplateColumns: columns }}
      >
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="grid size-7 shrink-0 place-items-center overflow-hidden">
          {player.agentId ? (
            <img
              alt=""
              className="size-full object-contain"
              src={`https://media.valorant-api.com/agents/${player.agentId}/displayicon.png`}
            />
          ) : (
            <IconUserFilled
              aria-hidden="true"
              className="size-3.5 text-zinc-600"
            />
          )}
        </span>
        <PlayerLink subject={player.subject} name={player.name} tagLine={player.hidden ? null : player.tagLine} level={player.level} tier={player.tier} playerCardId={player.playerCardId} className="text-[11px] font-medium" />
        {player.level != null && (
          <span className="shrink-0 text-[10px] text-zinc-500">
            Lvl {player.level}
          </span>
        )}
        {player.you && <You />}
        {player.partyGroup != null && (
          <span
            aria-label={`Queued together, party group ${player.partyGroup}`}
            className="inline-flex shrink-0 items-center gap-0.5 text-[8px] font-medium text-cyan-200/80"
            title={`Queued together · group ${player.partyGroup}`}
          >
            <IconUsersGroup aria-hidden="true" className="size-3" />
            Party {player.partyGroup}
          </span>
        )}
      </div>
      <div className="flex min-w-0 items-center gap-1.5">
        {icon ? (
          <img
            alt=""
            className={`size-5 shrink-0 object-contain ${player.hidden ? "opacity-40" : ""}`}
            src={icon}
          />
        ) : (
          <span
            className={`grid size-5 shrink-0 place-items-center rounded-full bg-white/[0.05] text-[9px] text-zinc-500 ${player.hidden ? "opacity-40" : ""}`}
          >
            {player.hidden ? "?" : "—"}
          </span>
        )}
        <span
          className={`truncate text-[10px] font-medium ${player.hidden || rankValue == null || rankValue < 3 ? "text-zinc-500" : "text-zinc-300"}`}
        >
          {rank}
        </span>
      </div>
      <span className="text-[10px] tabular-nums text-zinc-400">
        {statsLoading ? (
          <Skeleton className="h-3 w-8" />
        ) : games && wins != null ? (
          `${Math.round((wins / games) * 100)}%`
        ) : (
          "—"
        )}
      </span>
      <span
        className="text-[10px] tabular-nums text-zinc-400"
        title={
          player.you
            ? "Your selected recent match range"
            : "Last 5 completed matches"
        }
      >
        {statsLoading ? (
          <Skeleton className="h-3 w-8" />
        ) : (
          (kd?.toFixed(2) ?? "—")
        )}
      </span>
      <span
        className="text-[10px] tabular-nums text-zinc-400"
        title={
          player.you
            ? "Your selected recent match range"
            : "Last 5 completed matches"
        }
      >
        {statsLoading ? (
          <Skeleton className="h-3 w-8" />
        ) : headshotPct == null ? (
          "—"
        ) : (
          `${headshotPct.toFixed(1)}%`
        )}
      </span>
      {phase === "live" ? (
        <span
          className="text-[10px] tabular-nums text-zinc-300"
          title="Average combat score over the last five matches"
        >
          {statsLoading ? (
            <Skeleton className="h-3 w-8" />
          ) : player.acs == null ? (
            "—"
          ) : (
            Math.round(player.acs)
          )}
        </span>
      ) : (
        <span
          className={`text-[10px] ${locked ? "text-emerald-400" : "text-zinc-500"}`}
        >
          {status}
        </span>
      )}
        {phase === "live" ? (
          <button
            aria-label={`${expanded ? "Hide" : "Show"} ${player.name}'s loadout`}
            aria-expanded={expanded}
            className="grid size-6 place-items-center rounded-md text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30"
            onClick={onToggle}
            title="View weapon skins and buddies"
            type="button"
          >
            <IconChevronDown aria-hidden="true" className={`size-3.5 transition-transform duration-150 ${expanded ? "rotate-180" : ""}`} />
          </button>
        ) : null}
      </div>
      {expanded && phase === "live" && (
        <Loadout player={player} matchId={matchId} />
      )}
    </>
  );
}

export default Team;
