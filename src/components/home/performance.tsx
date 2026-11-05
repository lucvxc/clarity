import type { ReactNode } from "react";
import Glass from "../ui/glass";
import Skeleton from "../ui/skeleton";
import type { OverviewStats } from "../core/types";

type Props = {
  stats: OverviewStats | null;
  loading: boolean;
  detail: string;
  accent: string;
};

function Performance({ stats, loading, detail, accent }: Props) {
  const kd = stats?.kd == null ? null : stats.kd.toFixed(2);
  const matches = stats?.recentMatches ?? [];
  const wins = matches.filter((match) => match.won === true).length;
  const losses = matches.filter((match) => match.won === false).length;
  const results = wins + losses;
  const winRate = results ? `${((wins / results) * 100).toFixed(0)}%` : null;
  const acsMatches = matches.filter((match) => match.acs != null);
  const avgAcs = acsMatches.length
    ? Math.round(
        acsMatches.reduce((sum, match) => sum + (match.acs ?? 0), 0) /
          acsMatches.length,
      ).toString()
    : null;

  return (
    <div className="space-y-2">
      <Glass className="rounded-lg p-4">
        <div className="relative z-20">
          <Header title="Recent performance" detail={detail} />
          <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-4">
            <Value
              label="K/D ratio"
              value={loading ? <Skeleton className="h-7 w-16" /> : (kd ?? "—")}
            />
            <Value
              label="Headshot %"
              value={
                loading ? (
                  <Skeleton className="h-7 w-20" />
                ) : stats?.headshotPct == null ? (
                  <span className="text-sm font-medium text-zinc-500">
                    Hit data pending
                  </span>
                ) : (
                  `${stats.headshotPct.toFixed(1)}%`
                )
              }
            />
            <Value
              label="Win rate"
              detail={results ? `${wins}W · ${losses}L` : undefined}
              value={
                loading ? (
                  <Skeleton className="h-7 w-16" />
                ) : (
                  winRate ?? "—"
                )
              }
            />
            <Value
              label="Avg. ACS"
              value={
                loading ? <Skeleton className="h-7 w-16" /> : (avgAcs ?? "—")
              }
            />
          </div>
        </div>
      </Glass>

      <Glass className="rounded-lg p-4">
        <div className="relative z-20">
          <Header title="Accuracy" detail={detail} />
          {!loading && stats?.headshotPct == null ? (
            <p className="mt-3 text-xs text-zinc-500">
              Waiting for match hit details.
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              <Accuracy
                label="Head"
                value={stats?.headshotPct}
                count={stats?.headshots}
                loading={loading}
                accent={accent}
              />
              <Accuracy
                label="Body"
                value={stats?.bodyshotPct}
                count={stats?.bodyshots}
                loading={loading}
                accent={accent}
              />
              <Accuracy
                label="Legs"
                value={stats?.legshotPct}
                count={stats?.legshots}
                loading={loading}
                accent={accent}
              />
            </div>
          )}
        </div>
      </Glass>
    </div>
  );
}

function Header({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <p className="text-xs font-medium text-zinc-200">{title}</p>
      <p className="text-[10px] text-zinc-500">{detail}</p>
    </div>
  );
}

function Value({
  label,
  value,
  detail,
}: {
  label: string;
  value: ReactNode;
  detail?: string;
}) {
  return (
    <div>
      <p className="text-[10px] text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-white">
        {value}
      </p>
      {detail && <p className="mt-0.5 text-[9px] text-zinc-500">{detail}</p>}
    </div>
  );
}

function Accuracy({
  label,
  value,
  count,
  loading,
  accent,
}: {
  label: string;
  value: number | null | undefined;
  count: number | null | undefined;
  loading: boolean;
  accent: string;
}) {
  const progress = Math.max(0, Math.min(100, value ?? 0));
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[10px]">
        <span className="text-zinc-400">{label}</span>
        <span className="tabular-nums text-zinc-300">
          {loading ? (
            <Skeleton className="h-3 w-16" />
          ) : (
            <>
              {value == null ? "—" : `${value.toFixed(1)}%`}
              <span className="ml-2 text-zinc-600">
                {count == null ? "" : `${count} hits`}
              </span>
            </>
          )}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full"
          style={{ width: `${progress}%`, backgroundColor: accent }}
        />
      </div>
    </div>
  );
}

export function agentAccent(colors?: string[]) {
  const color = colors?.[colors.length - 1];
  if (!color) return "#6a98dc";
  const value = color.startsWith("#") ? color : `#${color}`;
  return /^#[\da-f]{6}$/i.test(value) ? value : "#6a98dc";
}

export default Performance;
