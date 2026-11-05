import type { ReactNode } from "react";
import Banner from "../ui/banner";
import Skeleton from "../ui/skeleton";
import { rankName } from "../core/rank";
import type { Account, OverviewStats, StatsStatus, Tier } from "../core/types";

type Props = {
  account: Account | null;
  stats: OverviewStats | null;
  status: StatsStatus;
  error: string | null;
  tiers: Record<number, Tier>;
  onRefresh: () => void;
};

function AccountSummary({
  account,
  stats,
  status,
  error,
  tiers,
  onRefresh,
}: Props) {
  const displayStatus = account ? status : "checking";
  const games = stats?.games ?? null;
  const wins = stats?.wins ?? null;
  const winRate =
    games != null && wins != null
      ? games > 0 ? Math.round((wins / games) * 100) : 0
      : null;

  return (
    <Banner
      cardId={account?.playerCardId ?? null}
      name={account?.gameName ?? null}
      tag={account ? `#${account.tagLine}` : null}
      loading={displayStatus === "checking"}
      onRefresh={onRefresh}
    >
        <div className="grid grid-cols-2 divide-x divide-white/[0.08] md:grid-cols-4">
          <RankCell
            label="Current rank"
            tier={account ? (stats?.currentTier ?? null) : null}
            tiers={tiers}
            status={displayStatus}
            rating={account ? stats?.rating : null}
          />
          <RankCell
            label="Peak rank"
            tier={account ? (stats?.peakTier ?? null) : null}
            tiers={tiers}
            status={displayStatus}
          />
          <ValueCell
            label="Win rate"
            value={
              !account || winRate == null
                ? emptyValue(displayStatus)
                : `${winRate}%`
            }
            detail={
              !account ? "Waiting for VALORANT" : games != null && wins != null ? (
                <>
                  <span className="text-emerald-400">{wins}W</span>
                  <span className="px-1 text-zinc-600">·</span>
                  <span className="text-rose-400">
                    {Math.max(games - wins, 0)}L
                  </span>
                </>
              ) : (
                "This season"
              )
            }
          />
          <ValueCell
            label="Ranked games"
            value={
              !account || games == null
                ? emptyValue(displayStatus)
                : String(games)
            }
            detail={account ? "This season" : "Waiting for VALORANT"}
          />
        </div>

        {account && (error || stats?.rankError) && (
          <p className="mt-3 break-words text-[10px] leading-4 text-amber-100/65">
            {friendlyError(error ?? stats?.rankError ?? "")}
          </p>
        )}
    </Banner>
  );
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
  const value =
    tier != null && tier >= 3
      ? rankName(tier, tiers)
      : tier != null && tier < 3
        ? "Unranked"
        : status === "checking"
          ? "…"
          : status === "error"
            ? "Unavailable"
            : label === "Peak rank"
              ? "No peak yet"
              : "No rank data";
  const progress = rating == null ? 0 : Math.min(100, Math.max(0, rating));
  const hasProgress =
    label === "Current rank" &&
    tier != null &&
    tier >= 3 &&
    rating != null;

  return (
    <div className="min-w-0 px-2 first:pl-0 last:pr-0 md:px-3">
      <p className="text-[10px] leading-3 text-zinc-500">{label}</p>
      <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
        {icon && (
          <img alt="" className="size-5 shrink-0 object-contain" src={icon} />
        )}
        <p className="truncate text-[13px] font-medium text-zinc-100">
          {status === "checking" && tier == null ? (
            <Skeleton className="h-4 w-20" />
          ) : (
            value
          )}
        </p>
      </div>
      {hasProgress && (
        <div className="mt-1.5">
          <div
            aria-label={`${progress} of 100 rank rating`}
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={progress}
            className="h-1 overflow-hidden rounded-full bg-white/10"
            role="progressbar"
          >
            <div
              className="h-full rounded-full bg-white/75 transition-[width] duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-0.5 text-[10px] leading-3 tabular-nums text-zinc-500">
            {progress} / 100 RR
          </p>
        </div>
      )}
    </div>
  );
}

function ValueCell({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: ReactNode;
}) {
  return (
    <div className="min-w-0 px-2 first:pl-0 last:pr-0 md:px-3">
      <p className="text-[10px] leading-3 text-zinc-500">{label}</p>
      <p className="mt-0.5 truncate text-[13px] font-medium text-zinc-100">
        {value === "…" ? <Skeleton className="h-4 w-14" /> : value}
      </p>
      <p className="mt-0 truncate text-[10px] leading-3 text-zinc-500">{detail}</p>
    </div>
  );
}

function emptyValue(status: StatsStatus) {
  return status === "checking" ? "…" : "—";
}

function friendlyError(error: string) {
  return error.includes("HTTP 429")
    ? "Riot is rate limiting rank data. Clarity will retry after a short cooldown."
    : error;
}

export default AccountSummary;
