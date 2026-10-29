import "./styles/App.css";
import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { HashRouter, useLocation, useNavigate } from "react-router";
import Frame from "./components/core/frame";
import Sidebar, { type SidebarTab } from "./components/core/sidebar";
import type { AccountStatus, CurrentMatch, MatchStatus, OverviewStats, StatsStatus, ValAcc } from "./components/core/types";
import AppRoutes from "./router";

function App() {
  return (
    <HashRouter>
      <AppShell />
    </HashRouter>
  );
}

function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const [refreshKey, setRefreshKey] = useState(0);
  const [limit, setLimit] = useState(5);
  const [rangeStatus, setRangeStatus] = useState<StatsStatus>("checking");
  const rangeOnly = useRef(false);
  const [account, setAccount] = useState<ValAcc | null>(null);
  const [accountStatus, setAccountStatus] = useState<AccountStatus>("checking");
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [statsStatus, setStatsStatus] = useState<StatsStatus>("checking");
  const [statsError, setStatsError] = useState<string | null>(null);
  const [match, setMatch] = useState<CurrentMatch | null>(null);
  const [matchStatus, setMatchStatus] = useState<MatchStatus>("checking");
  const [matchError, setMatchError] = useState<string | null>(null);
  const activeTab: SidebarTab = location.pathname.startsWith("/current-match")
    ? "match"
    : location.pathname.startsWith("/settings")
      ? "settings"
      : "home";

  useEffect(() => {
    let active = true;
    let pending = false;
    setAccountStatus("checking");

    async function refresh() {
      if (pending) return;
      pending = true;
      try {
        const next = await invoke<ValAcc | null>("get_valorant_account");
        if (!active) return;
        setAccount(next);
        setAccountStatus(next ? "connected" : "offline");
      } catch {
        if (!active) return;
        setAccount(null);
        setAccountStatus("offline");
      } finally {
        pending = false;
      }
    }

    void refresh();
    const interval = window.setInterval(() => void refresh(), 60_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [refreshKey]);

  useEffect(() => {
    if (activeTab !== "match") return;
    let active = true;
    let pending = false;

    async function refresh() {
      if (pending) return;
      pending = true;
      try {
        const next = await invoke<CurrentMatch | null>("get_valorant_current_match");
        if (!active) return;
        setMatch(next);
        setMatchError(null);
        setMatchStatus("ready");
      } catch (error) {
        if (!active) return;
        setMatch(null);
        setMatchError(typeof error === "string" ? error : "Riot Client match data is unavailable.");
        setMatchStatus("error");
      } finally {
        pending = false;
      }
    }

    setMatchStatus("checking");
    void refresh();
    const interval = window.setInterval(() => void refresh(), 10_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [activeTab]);

  useEffect(() => {
    let active = true;
    const isRangeChange = rangeOnly.current;
    rangeOnly.current = false;
    let pending = false;
    if (!isRangeChange) {
      setStatsStatus("checking");
      setRangeStatus("checking");
    }

    async function refresh() {
      if (pending) return;
      pending = true;
      try {
        const next = await invoke<OverviewStats>("get_valorant_stats", { limit });
        if (!active) return;
        setStats(next);
        setStatsError(null);
        setStatsStatus("ready");
        setRangeStatus("ready");
      } catch (cause) {
        if (!active) return;
        setStatsError(typeof cause === "string" ? cause : "Could not connect to the Riot PVP services. Check that Riot Client is open and signed in.");
        setRangeStatus("error");
        if (!isRangeChange) setStatsStatus("error");
      } finally {
        pending = false;
      }
    }

    void refresh();
    const interval = window.setInterval(() => void refresh(), 300_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [refreshKey, limit]);

  function changeLimit(next: number) {
    rangeOnly.current = true;
    setRangeStatus("checking");
    setLimit(next);
  }

  function changeTab(tab: SidebarTab) {
    navigate(tab === "home" ? "/home/" : tab === "match" ? "/current-match/" : "/settings/");
  }

  return (
    <Frame>
      <div className="flex h-full min-h-0 w-full">
        <Sidebar account={account} accountStatus={accountStatus} activeTab={activeTab} onTabChange={changeTab} />
        <main className="min-h-0 min-w-0 flex-1 overflow-hidden">
          <AppRoutes
            account={account}
            stats={stats}
            status={statsStatus}
            rangeStatus={rangeStatus}
            error={statsError}
            onRefresh={() => {
              rangeOnly.current = false;
              setStatsStatus("checking");
              setRangeStatus("checking");
              setRefreshKey((key) => key + 1);
            }}
            limit={limit}
            onLimit={changeLimit}
            match={match}
            matchStatus={matchStatus}
            matchError={matchError}
            connected={accountStatus === "connected"}
          />
        </main>
      </div>
    </Frame>
  );
}

export default App;
