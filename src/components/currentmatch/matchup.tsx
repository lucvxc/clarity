import Glass from "../ui/glass";
import Skeleton from "../ui/skeleton";
import type { MatchPlayer } from "../core/types";

type Props = {
  allies: MatchPlayer[];
  enemies: MatchPlayer[];
  loading: boolean;
};

function Matchup({ allies, enemies, loading }: Props) {
  const friendly = summarize(allies);
  const enemy = summarize(enemies);
  const totalAcs = (friendly.acs ?? 0) + (enemy.acs ?? 0);
  const split =
    friendly.acs != null && enemy.acs != null && totalAcs > 0
      ? Math.round((friendly.acs / totalAcs) * 100)
      : null;

  return (
    <Glass className="rounded-lg p-3">
      <div className="relative z-20">
        <div className="mb-2">
          <h2 className="text-[11px] font-medium text-zinc-200">Matchup</h2>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Side title="Your team" side="ally" data={friendly} loading={loading} />
          <Side title="Enemy team" side="enemy" data={enemy} loading={loading} />
        </div>
        <div className="mt-2.5">
          <div
            aria-label={
              split == null
                ? "Average ACS comparison unavailable"
                : `Average ACS comparison: your team ${split} percent, enemy team ${100 - split} percent`
            }
            className="flex h-1.5 overflow-hidden rounded-full bg-white/[0.06]"
            role="img"
          >
            {split != null && (
              <>
                <span
                  className="h-full bg-emerald-400/80 transition-[width] duration-300"
                  style={{ width: `${split}%` }}
                />
                <span className="h-full flex-1 bg-rose-400/75" />
              </>
            )}
          </div>
          <div className="mt-1 flex justify-between text-[9px] tabular-nums text-zinc-500">
            <span>
              {loading
                ? "Updating stats"
                : split == null
                  ? "ACS comparison unavailable"
                  : `Your team ${split}%`}
            </span>
            <span>{split == null ? "" : `Enemy team ${100 - split}%`}</span>
          </div>
        </div>
      </div>
    </Glass>
  );
}

function Side({
  title,
  side,
  data,
  loading,
}: {
  title: string;
  side: "ally" | "enemy";
  data: Summary;
  loading: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className={`text-[10px] font-medium ${side === "ally" ? "text-emerald-300" : "text-rose-300"}`}>
          {title}
        </span>
        {loading ? (
          <Skeleton className="h-2 w-10" />
        ) : (
          <span className="text-[9px] text-zinc-600">{data.players} players</span>
        )}
      </div>
      <div className="grid grid-cols-4 gap-2">
        <Stat label="AVG K/D" value={data.kd} loading={loading} />
        <Stat label="AVG HS" value={data.hs} suffix="%" loading={loading} />
        <Stat label="AVG ACS" value={data.acs} loading={loading} />
        <Stat label="WIN RATE" value={data.winRate} suffix="%" loading={loading} />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  suffix = "",
  loading,
}: {
  label: string;
  value: number | null;
  suffix?: string;
  loading: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[8px] text-zinc-500">{label}</p>
      {loading ? (
        <Skeleton className="mt-1 h-3 w-8" />
      ) : (
        <p className="mt-0.5 truncate text-[11px] font-medium tabular-nums text-zinc-200">
          {value == null ? "N/A" : `${value.toFixed(1)}${suffix}`}
        </p>
      )}
    </div>
  );
}

type Summary = {
  players: number;
  kd: number | null;
  hs: number | null;
  acs: number | null;
  winRate: number | null;
};

function summarize(players: MatchPlayer[]): Summary {
  const visible = players.filter((player) => !player.hidden);
  const rated = visible.filter(
    (player) =>
      player.games != null && player.games > 0 && player.wins != null,
  );
  const games = rated.reduce((total, player) => total + (player.games ?? 0), 0);
  const wins = rated.reduce((total, player) => total + (player.wins ?? 0), 0);
  return {
    players: visible.filter(
      (player) =>
        player.kd != null ||
        player.headshotPct != null ||
        player.acs != null ||
        player.games != null,
    ).length,
    kd: mean(visible.map((player) => player.kd)),
    hs: mean(visible.map((player) => player.headshotPct)),
    acs: mean(visible.map((player) => player.acs)),
    winRate: games ? (wins / games) * 100 : null,
  };
}

function mean(values: (number | null)[]) {
  const available = values.filter((value): value is number => value != null && Number.isFinite(value));
  return available.length
    ? available.reduce((total, value) => total + value, 0) / available.length
    : null;
}

export default Matchup;
