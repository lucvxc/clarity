import { invoke } from "@tauri-apps/api/core";
import { IconArrowLeft } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { getTiers } from "../../components/core/catalog";
import type {
  MatchPage,
  PlayerStats,
  RecentMatch,
  Tier,
} from "../../components/core/types";
import MatchList from "../../components/matches/list";
import Card from "../../components/player/card";
import Summary from "../../components/player/summary";
import Spinner from "../../components/ui/spinner";

type Identity = {
  name?: string;
  tagLine?: string | null;
  level?: number | null;
  tier?: number | null;
  playerCardId?: string | null;
};

function Player() {
  const { subject = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const identity = readIdentity(subject, location.state);
  const [tab, setTab] = useState<"overview" | "history">("overview");
  const [matches, setMatches] = useState<RecentMatch[]>([]);
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [rankLoading, setRankLoading] = useState(true);
  const [tiers, setTiers] = useState<Record<number, Tier>>({});
  const [offset, setOffset] = useState(0);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const player = useRef(subject);
  const run = useRef(0);

  useEffect(() => {
    let active = true;
    const id = ++run.current;
    const changed = player.current !== subject;
    player.current = subject;
    setLoading(true);
    setError(false);
    if (changed) {
      setMatches([]);
      setStats(null);
      setOffset(0);
      setMore(false);
    }
    setRankLoading(true);
    setLoadingMore(false);
    getTiers()
      .then((value) => { if (active) setTiers(value); })
      .catch(() => {});
    invoke<Record<string, PlayerStats>>("player_profiles", { subjects: [subject] })
      .then((value) => { if (active) setStats(value[subject] ?? null); })
      .catch(() => {})
      .finally(() => { if (active) setRankLoading(false); });
    invoke<MatchPage>("player_history", { subject, offset: 0 })
      .then((page) => {
        if (!active || id !== run.current) return;
        setMatches(page.matches);
        setOffset(page.nextOffset);
        setMore(page.hasMore);
      })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [subject, refresh]);

  async function loadMore() {
    if (loadingMore || !more) return;
    const id = run.current;
    setLoadingMore(true);
    try {
      const page = await invoke<MatchPage>("player_history", { subject, offset });
      if (id !== run.current) return;
      setMatches((current) => [...current, ...page.matches]);
      setOffset(page.nextOffset);
      setMore(page.hasMore);
    } catch {
      if (id === run.current) setMore(false);
    } finally {
      if (id === run.current) setLoadingMore(false);
    }
  }

  return (
    <div className="h-full overflow-y-auto px-5 pb-6 pt-11 [scrollbar-color:rgba(255,255,255,0.18)_transparent] [scrollbar-width:thin]">
      <div className="mx-auto max-w-6xl space-y-3">
        <button
          className="flex items-center gap-2 text-xs text-zinc-400 hover:text-white"
          onClick={() => navigate(-1)}
          type="button"
        >
          <IconArrowLeft className="size-4" />
          Back
        </button>
        <Card
          name={identity.name ?? "Player"}
          tagLine={identity.tagLine ?? null}
          level={identity.level ?? null}
          playerCardId={identity.playerCardId ?? null}
          tier={identity.tier ?? null}
          stats={stats}
          loading={rankLoading && !stats}
          tiers={tiers}
          onRefresh={() => setRefresh((value) => value + 1)}
        />
        <div className="flex gap-5 border-b border-white/[0.08] px-1">
          {(["overview", "history"] as const).map((value) => (
            <button
              key={value}
              className={`border-b-2 pb-2 text-xs transition-colors ${tab === value ? "border-white/80 text-white" : "border-transparent text-zinc-500 hover:text-zinc-200"}`}
              onClick={() => setTab(value)}
              type="button"
            >
              {value === "history" ? "Match history" : "Overview"}
            </button>
          ))}
        </div>
        {loading && !matches.length ? (
          <div className="flex h-48 items-center justify-center"><Spinner /></div>
        ) : error && !matches.length ? (
          <p className="py-12 text-center text-xs text-zinc-500">
            This player’s stats are unavailable right now.
          </p>
        ) : tab === "overview" ? (
          <Summary matches={matches} subject={subject} tiers={tiers} />
        ) : (
          <div className="space-y-3">
            <MatchList
              matches={matches}
              status="ready"
              detail="No matches available"
              tiers={tiers}
              limit={matches.length}
              title=""
              subject={subject}
            />
            {more && (
              <button
                className="mx-auto block rounded-md border border-white/10 bg-white/[0.05] px-4 py-2 text-xs text-zinc-300 hover:bg-white/[0.08]"
                disabled={loadingMore}
                onClick={loadMore}
                type="button"
              >
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function readIdentity(subject: string, state: unknown): Identity {
  if (state) return state as Identity;
  try {
    return JSON.parse(sessionStorage.getItem(`clarity:player:${subject}`) ?? "null") ?? {};
  } catch {
    return {};
  }
}

export default Player;
