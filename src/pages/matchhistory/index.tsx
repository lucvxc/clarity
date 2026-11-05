import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { getActs, getTiers, type ActInfo } from "../../components/core/catalog";
import type {
  Account,
  PlayerStats,
  RecentMatch,
  StatsStatus,
  Tier,
} from "../../components/core/types";
import Profile from "../../components/matches/profile";
import MatchList from "../../components/matches/list";

type Props = {
  account: Account | null;
  matches: RecentMatch[];
  status: StatsStatus;
  error: string | null;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
};

function MatchHistory({
  account,
  matches,
  status,
  error,
  hasMore,
  loadingMore,
  onLoadMore,
}: Props) {
  const [tiers, setTiers] = useState<Record<number, Tier>>({});
  const [acts, setActs] = useState<ActInfo[] | null>(null);
  const [profile, setProfile] = useState<PlayerStats | null>(null);
  const [profileStatus, setProfileStatus] = useState<StatsStatus>("checking");
  const scroller = useRef<HTMLDivElement>(null);
  const seen = useRef(matches.length);
  const wasReady = useRef(false);

  useEffect(() => {
    let active = true;
    void Promise.allSettled([getTiers(), getActs()]).then(
      ([rankData, actData]) => {
        if (!active) return;
        if (rankData.status === "fulfilled") setTiers(rankData.value);
        setActs(actData.status === "fulfilled" ? actData.value : []);
      },
    );
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const subject = account?.subject;
    if (!subject) {
      setProfile(null);
      setProfileStatus("checking");
      return;
    }

    let active = true;
    setProfile(null);
    setProfileStatus("checking");
    void invoke<Record<string, PlayerStats>>("player_profiles", {
      subjects: [subject],
    })
      .then((profiles) => {
        if (!active) return;
        setProfile(profiles[subject] ?? null);
        setProfileStatus("ready");
      })
      .catch(() => {
        if (active) setProfileStatus("error");
      });
    return () => {
      active = false;
    };
  }, [account?.subject]);

  useEffect(() => {
    const changed = matches.length !== seen.current;
    seen.current = matches.length;
    const becameReady = status === "ready" && !wasReady.current;
    wasReady.current = status === "ready";
    const element = scroller.current;
    if (!element || !hasMore || loadingMore || status !== "ready" || error)
      return;
    const target = element;

    function loadAtEnd() {
      if (
        target.scrollHeight - target.scrollTop - target.clientHeight < 240
      ) {
        onLoadMore();
      }
    }

    target.addEventListener("scroll", loadAtEnd);
    if ((changed || becameReady) && matches.length > 0) loadAtEnd();
    return () => target.removeEventListener("scroll", loadAtEnd);
  }, [error, hasMore, loadingMore, matches.length, onLoadMore, status]);

  const detail = error
    ? "Match history is unavailable right now."
    : "Queue up in VALORANT to start building your match history.";

  return (
    <div ref={scroller} className="h-full overflow-y-auto px-4 pb-4 pt-11 [scrollbar-color:rgba(255,255,255,0.18)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/15 [&::-webkit-scrollbar-thumb:hover]:bg-white/25 [&::-webkit-scrollbar-track]:bg-transparent">
      <div className="w-full space-y-3">
        <Profile
          account={account}
          profile={profile}
          status={profileStatus}
          tiers={tiers}
          acts={acts}
        />
        <MatchList
          matches={matches}
          status={status}
          detail={detail}
          tiers={tiers}
          limit={matches.length}
          title=""
          hasMore={hasMore}
        />
      </div>
    </div>
  );
}

export default MatchHistory;
