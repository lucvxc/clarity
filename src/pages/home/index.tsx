import { useEffect, useState } from "react";
import Select from "../../components/ui/select";
import {
  getAgent,
  getTiers,
  type AgentInfo,
} from "../../components/core/catalog";
import AccountSummary from "../../components/home/accountsummary";
import AgentFeature from "../../components/home/agentfeature";
import Performance, { agentAccent } from "../../components/home/performance";
import MatchList from "../../components/matches/list";
import type {
  OverviewStats,
  StatsStatus,
  Tier,
  Account,
} from "../../components/core/types";

type HomeProps = {
  account: Account | null;
  stats: OverviewStats | null;
  status: StatsStatus;
  rangeStatus: StatsStatus;
  error: string | null;
  onRefresh: () => void;
  limit: number;
  onLimit: (limit: number) => void;
};

const ranges = [
  { label: "Overall · current act", value: 0 },
  { label: "Last 10 matches", value: 10 },
  { label: "Last 30 matches", value: 30 },
];
function Home({
  account,
  stats,
  status,
  rangeStatus,
  error,
  onRefresh,
  limit,
  onLimit,
}: HomeProps) {
  const [tiers, setTiers] = useState<Record<number, Tier>>({});
  const [agent, setAgent] = useState<AgentInfo | null>(null);

  useEffect(() => {
    let active = true;

    getTiers()
      .then((tiers) => {
        if (active) setTiers(tiers);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    setAgent(null);
    const agentId = stats?.agent;
    if (!agentId) return;

    getAgent(agentId)
      .then((value) => {
        if (active) setAgent(value);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [stats?.agent]);

  const recentCount = stats?.recentGames ?? null;
  const recentMatches = stats?.recentMatches ?? [];
  const viewStatus = account ? status : "checking";
  const rangeLoading =
    !account || status === "checking" || rangeStatus === "checking";
  const accuracyAccent = agentAccent(agent?.backgroundGradientColors);
  const recentDetail = !account
    ? "Launch VALORANT to show stats"
    : rangeLoading
      ? "Updating recent performance"
      : stats?.matchError
        ? "Match history unavailable"
        : recentCount == null
          ? "No recent match data"
          : recentCount === 0
            ? "No recent matches"
            : limit === 0
              ? `${recentCount} matches this act`
              : `Last ${recentCount} matches`;

  return (
    <div className="h-full overflow-y-auto px-7 pb-7 pt-12 [scrollbar-color:rgba(255,255,255,0.18)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/15 [&::-webkit-scrollbar-thumb:hover]:bg-white/25 [&::-webkit-scrollbar-track]:bg-transparent">
      <div className="mx-auto max-w-5xl space-y-2">
        <AccountSummary
          account={account}
          stats={stats}
          status={viewStatus}
          error={error}
          tiers={tiers}
          onRefresh={onRefresh}
        />

        <div className="grid grid-cols-1 items-stretch gap-3 sm:grid-cols-[minmax(190px,0.72fr)_minmax(0,1.28fr)]">
          <AgentFeature
            agent={agent}
            status={viewStatus}
            agentGames={stats?.agentGames ?? null}
            recentGames={recentCount}
          />

          <div className="space-y-2">
            <Select
              label="Match range"
              value={limit}
              options={ranges}
              onChange={onLimit}
              className="w-full"
              fullWidth
            />
            <Performance
              stats={stats}
              loading={rangeLoading}
              detail={recentDetail}
              accent={accuracyAccent}
            />
          </div>
        </div>
        <MatchList
          matches={recentMatches}
          detail={recentDetail}
          status={viewStatus}
          tiers={tiers}
        />
      </div>
    </div>
  );
}

export default Home;
