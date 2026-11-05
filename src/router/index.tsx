import { Component, type ErrorInfo, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router";
import CurrentMatchPage from "../pages/currentmatch";
import Home from "../pages/home";
import Lineups from "../pages/lineups";
import MatchHistory from "../pages/matchhistory";
import Settings from "../pages/settings";
import Store from "../pages/store";
import Player from "../pages/player";
import MatchPage from "../pages/match";
import type {
  CurrentMatch,
  MatchStatus,
  OverviewStats,
  RecentMatch,
  StatsStatus,
  Account,
} from "../components/core/types";

type Props = {
  account: Account | null;
  stats: OverviewStats | null;
  status: StatsStatus;
  rangeStatus: StatsStatus;
  error: string | null;
  onRefresh: () => void;
  limit: number;
  onLimit: (limit: number) => void;
  match: CurrentMatch | null;
  matchStatus: MatchStatus;
  matchError: string | null;
  profileLoading: boolean;
  connected: boolean;
  history: RecentMatch[];
  historyStatus: StatsStatus;
  historyError: string | null;
  historyHasMore: boolean;
  historyLoading: boolean;
  onLoadMoreHistory: () => void;
};

function AppRoutes(props: Props) {
  return (
    <Routes>
      <Route path="/" element={<Navigate replace to="/home/" />} />
      <Route
        path="/home/*"
        element={
          <Home
            account={props.account}
            stats={props.stats}
            status={props.status}
            rangeStatus={props.rangeStatus}
            error={props.error}
            onRefresh={props.onRefresh}
            limit={props.limit}
            onLimit={props.onLimit}
          />
        }
      />
      <Route
        path="/currentmatch/*"
        element={
          <CurrentMatchPage
            connected={props.connected}
            error={props.matchError}
            match={props.match}
            stats={props.stats}
            statsLoading={props.status === "checking"}
            status={props.matchStatus}
            profileLoading={props.profileLoading}
          />
        }
      />
      <Route
        path="/matchhistory/:matchId"
        element={<MatchPage matches={props.history} />}
      />
      <Route
        path="/matchhistory/*"
        element={
          <PageGuard>
            <MatchHistory
              account={props.account}
              matches={props.history}
              status={props.historyStatus}
              error={props.historyError}
              hasMore={props.historyHasMore}
              loadingMore={props.historyLoading}
              onLoadMore={props.onLoadMoreHistory}
            />
          </PageGuard>
        }
      />
      <Route path="/settings/*" element={<Settings />} />
      <Route path="/store/*" element={<Store account={props.account} />} />
      <Route path="/lineups/*" element={<Lineups />} />
      <Route path="/player/:subject/*" element={<Player />} />
      <Route path="*" element={<Navigate replace to="/home/" />} />
    </Routes>
  );
}

class PageGuard extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      "[Clarity] Match history render failed",
      error,
      info.componentStack,
    );
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full items-center justify-center px-5">
          <div className="max-w-md text-center" role="alert">
            <p className="text-sm font-medium text-zinc-200">
              Match history couldn’t load
            </p>
            <p className="mt-1 text-xs leading-5 text-zinc-500">
              {this.state.error.message || "The page encountered an error."}
            </p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default AppRoutes;
