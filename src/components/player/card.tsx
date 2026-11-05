import type { ReactNode } from "react";
import { rankName } from "../core/rank";
import type { PlayerStats, Tier } from "../core/types";
import Banner from "../ui/banner";
import Skeleton from "../ui/skeleton";

type Props = {
  name: string;
  tagLine: string | null;
  level: number | null;
  playerCardId: string | null;
  tier: number | null;
  stats: PlayerStats | null;
  loading: boolean;
  tiers: Record<number, Tier>;
  onRefresh: () => void;
};

function Card({ name, tagLine, level, playerCardId, tier, stats, loading, tiers, onRefresh }: Props) {
  const cardId = playerCardId ?? stats?.playerCardId;
  const current = stats?.currentTier ?? tier;
  const peak = stats?.peakTier;
  const games = stats?.games;
  const wins = stats?.wins;
  const winRate = games && wins != null ? Math.round(wins / games * 100) : games === 0 ? 0 : null;

  return (
    <Banner cardId={cardId ?? null} name={name} tag={tagLine ? `#${tagLine}` : level != null ? `Lvl ${level}` : "Player"} loading={loading} onRefresh={onRefresh}>
        <div className="grid grid-cols-2 divide-x divide-white/[0.08] md:grid-cols-4">
          <Rank label="Current rank" value={current} tiers={tiers} loading={loading && current == null} known={stats != null} />
          <Rank label="Peak rank" value={peak} tiers={tiers} loading={loading} known={stats != null} />
          <Cell label="Win rate" value={winRate == null ? null : `${winRate}%`} loading={loading} detail={games != null && wins != null ? <><span className="text-emerald-400">{wins}W</span><span className="px-1 text-zinc-600">·</span><span className="text-rose-400">{Math.max(0, games - wins)}L</span></> : "This season"} />
          <Cell label="Ranked games" value={games == null ? null : String(games)} loading={loading} detail="This season" />
        </div>
    </Banner>
  );
}

function Rank({ label, value, tiers, loading, known }: { label: string; value: number | null | undefined; tiers: Record<number, Tier>; loading: boolean; known: boolean }) {
  const icon = value == null ? null : tiers[value]?.smallIcon || tiers[value]?.largeIcon;
  return <div className="min-w-0 px-2 first:pl-0 last:pr-0 md:px-3"><p className="text-[10px] leading-3 text-zinc-500">{label}</p><div className="mt-0.5 flex items-center gap-1.5">{icon && <img alt="" className="size-5 shrink-0 object-contain" src={icon} />}{loading ? <Skeleton className="h-4 w-20" /> : <p className="truncate text-[13px] font-medium text-zinc-100">{value == null ? known ? label === "Peak rank" ? "No peak yet" : "Unranked" : "Unavailable" : value < 3 ? "Unranked" : rankName(value, tiers)}</p>}</div></div>;
}

function Cell({ label, value, detail, loading }: { label: string; value: string | null; detail: ReactNode; loading: boolean }) {
  return <div className="min-w-0 px-2 first:pl-0 last:pr-0 md:px-3"><p className="text-[10px] leading-3 text-zinc-500">{label}</p>{loading ? <Skeleton className="mt-1 h-4 w-14" /> : <p className="mt-0.5 truncate text-[13px] font-medium text-zinc-100">{value ?? "Unavailable"}</p>}<p className="truncate text-[10px] leading-3 text-zinc-500">{detail}</p></div>;
}

export default Card;
