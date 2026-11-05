import "./styles/App.css";
import { HashRouter, useLocation, useNavigate } from "react-router";
import Frame from "./components/core/frame";
import Sidebar, { type SidebarTab } from "./components/core/sidebar";
import Rpc from "./components/core/rpc";
import { useValorant } from "./components/core/usevalorant";
import { ToastProvider } from "./components/ui/toast";
import AppRoutes from "./router";

function App() {
  return (
    <HashRouter>
      <ToastProvider>
        <AppShell />
      </ToastProvider>
    </HashRouter>
  );
}

function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const activeTab: SidebarTab = location.pathname.startsWith("/currentmatch")
    ? "match"
    : location.pathname.startsWith("/matchhistory")
      ? "history"
      : location.pathname.startsWith("/store")
        ? "store"
        : location.pathname.startsWith("/lineups")
          ? "lineups"
          : location.pathname.startsWith("/settings")
            ? "settings"
            : "home";
  const data = useValorant(location.pathname.startsWith("/player/") ? "player" : activeTab);

  function changeTab(tab: SidebarTab) {
    const paths: Record<SidebarTab, string> = {
      home: "/home/",
      store: "/store/",
      match: "/currentmatch/",
      history: "/matchhistory/",
      lineups: "/lineups/",
      settings: "/settings/",
    };
    navigate(paths[tab]);
  }

  return (
    <Frame>
      <div className="flex h-full min-h-0 w-full">
        <Rpc account={data.account} stats={data.stats} />
        <Sidebar
          account={data.account}
          accountStatus={data.accountStatus}
          activeTab={activeTab}
          onTabChange={changeTab}
        />
        <main className="min-h-0 min-w-0 flex-1 overflow-hidden">
          <AppRoutes
            account={data.account}
            stats={data.stats}
            status={data.statsStatus}
            rangeStatus={data.rangeStatus}
            error={data.statsError}
            onRefresh={data.refresh}
            limit={data.limit}
            onLimit={data.changeLimit}
            match={data.match}
            matchStatus={data.matchStatus}
            matchError={data.matchError}
            profileLoading={data.profileLoading}
            connected={data.accountStatus === "connected"}
            history={data.history}
            historyStatus={data.historyStatus}
            historyError={data.historyError}
            historyHasMore={data.historyHasMore}
            historyLoading={data.historyLoading}
            onLoadMoreHistory={data.loadMoreHistory}
          />
        </main>
      </div>
    </Frame>
  );
}

export default App;
