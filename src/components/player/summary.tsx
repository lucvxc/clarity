import { useMemo } from "react";
import type { RecentMatch, Tier } from "../core/types";
import MatchList from "../matches/list";
import Glass from "../ui/glass";

type Props = {
  matches: RecentMatch[];
  subject: string;
  tiers: Record<number, Tier>;
};

function Summary({ matches, subject, tiers }: Props) {
  const stats = useMemo(() => {
    const games = matches.slice(0, 20);
    const sum = (field: "kills" | "deaths" | "headshots" | "bodyshots" | "legshots") =>
      games.reduce((total, match) => total + (match[field] ?? 0), 0);
    const kills = sum("kills");
    const deaths = sum("deaths");
    const head = sum("headshots");
    const hits = head + sum("bodyshots") + sum("legshots");
    const scored = games.filter((match) => match.acs != null);
    const decided = games.filter((match) => match.won != null);
    const wins = decided.filter((match) => match.won).length;

    return [
      ["Matches", String(games.length)],
      ["Win rate", decided.length ? `${Math.round((wins / decided.length) * 100)}%` : "N/A"],
      ["K/D", deaths ? (kills / deaths).toFixed(2) : kills ? String(kills) : "0.00"],
      ["Headshot %", hits ? `${((head / hits) * 100).toFixed(1)}%` : "N/A"],
      ["ACS", scored.length ? String(Math.round(scored.reduce((total, match) => total + (match.acs ?? 0), 0) / scored.length)) : "N/A"],
    ] as const;
  }, [matches]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
        {stats.map(([label, value]) => (
          <Glass key={label} className="rounded-lg px-3 py-3">
            <div className="relative z-20">
              <p className="text-[10px] text-zinc-500">{label}</p>
              <p className="mt-1 text-lg font-medium tabular-nums text-white">{value}</p>
            </div>
          </Glass>
        ))}
      </div>
      <MatchList
        matches={matches.slice(0, 5)}
        status="ready"
        detail="No matches available"
        tiers={tiers}
        limit={5}
        title="Recent matches"
        subject={subject}
      />
    </div>
  );
}

export default Summary;
