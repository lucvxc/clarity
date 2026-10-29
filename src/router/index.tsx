import { Navigate, Route, Routes } from "react-router";
import CurrentMatchPage from "../pages/current-match";
import Home from "../pages/home";
import Settings from "../pages/settings";
import type { CurrentMatch, MatchStatus, OverviewStats, StatsStatus, ValAcc } from "../components/core/types";

type RouteProps = {
  account: ValAcc | null;
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
  connected: boolean;
};

function AppRoutes(props: RouteProps) {
  return (
    <Routes>
      <Route path="/" element={<Navigate replace to="/home/" />} />
      <Route path="/home/*" element={<Home account={props.account} stats={props.stats} status={props.status} rangeStatus={props.rangeStatus} error={props.error} onRefresh={props.onRefresh} limit={props.limit} onLimit={props.onLimit} />} />
      <Route path="/current-match/*" element={<CurrentMatchPage connected={props.connected} error={props.matchError} match={props.match} stats={props.stats} statsLoading={props.status === "checking"} status={props.matchStatus} />} />
      <Route path="/settings/*" element={<Settings />} />
      <Route path="*" element={<Navigate replace to="/home/" />} />
    </Routes>
  );
}

export default AppRoutes;
