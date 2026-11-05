import { useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "react-router";
import { getTiers } from "../../components/core/catalog";
import type { RecentMatch, Tier } from "../../components/core/types";
import MatchDetails from "../../components/matches/details";
import Glass from "../../components/ui/glass";

type State = { match?: RecentMatch; subject?: string };

function MatchPage({ matches }: { matches: RecentMatch[] }) {
  const { matchId = "" } = useParams();
  const location = useLocation();
  const state = location.state as State | null;
  const [tiers, setTiers] = useState<Record<number, Tier>>({});
  const saved = useMemo(() => readMatch(matchId), [matchId]);
  const match = useMemo(
    () => state?.match ?? matches.find((item) => item.matchId === matchId) ?? saved?.match,
    [matchId, matches, saved, state],
  );
  const subject = state?.subject ?? saved?.subject;

  useEffect(() => {
    let active = true;
    getTiers().then((value) => { if (active) setTiers(value); }).catch(() => {});
    return () => { active = false; };
  }, []);

  if (!match) {
    return (
      <div className="flex h-full items-center justify-center p-5">
        <Glass className="max-w-sm p-5 text-center">
          <p className="relative z-20 text-xs text-zinc-400">This match is no longer available.</p>
        </Glass>
      </div>
    );
  }

  return <MatchDetails key={matchId} match={match} tiers={tiers} subject={subject} />;
}

function readMatch(id: string): { match?: RecentMatch; subject?: string } | undefined {
  try {
    const value = JSON.parse(sessionStorage.getItem(`clarity:match:${id}`) ?? "null") as
      | { match?: RecentMatch; subject?: string }
      | RecentMatch
      | null;
    if (!value) return undefined;
    const direct = "matchId" in value;
    const match = direct ? value : value.match;
    const subject = direct ? undefined : value.subject;
    return match?.matchId === id ? { match, subject } : undefined;
  } catch {
    return undefined;
  }
}

export default MatchPage;
