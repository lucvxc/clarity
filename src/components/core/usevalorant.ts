import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useToast } from "../ui/toast";
import type {
  AccountStatus,
  CurrentMatch,
  MatchStatus,
  MatchPage,
  OverviewStats,
  PlayerStats,
  RecentMatch,
  StatsStatus,
  Account,
} from "./types";

const ACCOUNT_MS = 60_000;
const MATCH_MS = 30_000;
const STATS_MS = 900_000;
const HIT_RETRY_MS = 120_000;
const STATS_CHECK_MS = 60_000;
const pending = new Map<string, Promise<unknown>>();

function request<T>(
  command: string,
  args?: Record<string, unknown>,
  scope = "",
) {
  const key = `${scope}:${command}:${JSON.stringify(args ?? {})}`;
  const current = pending.get(key);
  if (current) return current as Promise<T>;

  const task = invoke<T>(command, args).finally(() => pending.delete(key));
  pending.set(key, task);
  return task;
}

export function useValorant(tab: "home" | "match" | "history" | "store" | "lineups" | "settings" | "player") {
  const toast = useToast();
  const [focused, setFocused] = useState(
    () => document.visibilityState === "visible" && document.hasFocus(),
  );
  const [refreshKey, setRefreshKey] = useState(0);
  const [limit, setLimit] = useState(10);
  const [rangeStatus, setRangeStatus] = useState<StatsStatus>("checking");
  const rangeOnly = useRef(false);
  const [account, setAccount] = useState<Account | null>(null);
  const accountRef = useRef(account);
  accountRef.current = account;
  const [accountStatus, setAccountStatus] = useState<AccountStatus>("checking");
  const accountKey = account ? `${account.gameName}#${account.tagLine}` : "";
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const statsRef = useRef(stats);
  statsRef.current = stats;
  const [statsStatus, setStatsStatus] = useState<StatsStatus>("checking");
  const [statsError, setStatsError] = useState<string | null>(null);
  const statsAt = useRef(0);
  const statsAccount = useRef("");
  const seenLimit = useRef(limit);
  const seenRefresh = useRef(refreshKey);
  const [match, setMatch] = useState<CurrentMatch | null>(null);
  const [matchStatus, setMatchStatus] = useState<MatchStatus>("checking");
  const [matchError, setMatchError] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const matchAccount = useRef("");
  const profileKey = useRef("");
  const [history, setHistory] = useState<RecentMatch[]>([]);
  const [historyStatus, setHistoryStatus] = useState<StatsStatus>("checking");
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyHasMore, setHistoryHasMore] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const historyOffset = useRef(0);
  const historyStarted = useRef(false);
  const historyAccount = useRef("");
  const historyTab = useRef(false);
  const historyRun = useRef(0);
  const historyPending = useRef(false);
  const historyMore = useRef(true);

  useEffect(() => {
    function update() {
      setFocused(document.visibilityState === "visible" && document.hasFocus());
    }

    window.addEventListener("focus", update);
    window.addEventListener("blur", update);
    document.addEventListener("visibilitychange", update);
    update();
    return () => {
      window.removeEventListener("focus", update);
      window.removeEventListener("blur", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);

  useEffect(() => {
    if (!focused) return;
    let active = true;
    let pending = false;
    if (!accountRef.current) setAccountStatus("checking");

    async function load() {
      if (pending) return;
      pending = true;
      try {
        const value = await request<Account | null>("account");
        if (!active) return;
        setAccount((current) => (sameAccount(current, value) ? current : value));
        setAccountStatus(value ? "connected" : "offline");
      } catch {
        if (!active) return;
        setAccountStatus((current) =>
          current === "connected" ? current : "offline",
        );
      } finally {
        pending = false;
      }
    }

    void load();
    const timer = window.setInterval(() => void load(), ACCOUNT_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [focused]);

  useEffect(() => {
    if (tab !== "match" || !focused) return;
    if (!accountKey) {
      matchAccount.current = "";
      setMatch(null);
      setMatchError(null);
      setMatchStatus("ready");
      setProfileLoading(false);
      return;
    }
    if (matchAccount.current !== accountKey) {
      matchAccount.current = accountKey;
      profileKey.current = "";
      setMatch(null);
      setProfileLoading(false);
    }
    let active = true;
    let pending = false;

    async function load() {
      if (pending) return;
      pending = true;
      try {
        const value = await request<CurrentMatch | null>("current_match");
        if (!active) return;
        setMatch((previous) => mergeMatch(value, previous));
        setMatchError(null);
        setMatchStatus("ready");
        if (!value) {
          profileKey.current = "";
          setProfileLoading(false);
        } else {
          const subjects = value.players
            .filter((player) => player.you || !player.hidden)
            .map((player) => player.subject)
            .filter(Boolean);
          const key = [...subjects].sort().join(":");
          if (key && key !== profileKey.current) {
            profileKey.current = key;
            setProfileLoading(true);
            void request<Record<string, PlayerStats>>("player_profiles", {
              subjects,
            })
              .then((profiles) => {
                if (!active) return;
                setMatch((current) =>
                  current
                    ? {
                        ...current,
                        players: current.players.map((player) => {
                          const profile = profiles[player.subject];
                          return profile
                            ? {
                                ...player,
                                playerCardId:
                                  profile.playerCardId ?? player.playerCardId,
                                level: profile.level ?? player.level,
                                games: profile.games ?? player.games,
                                wins: profile.wins ?? player.wins,
                                kd: profile.kd ?? player.kd,
                                headshotPct:
                                  profile.headshotPct ?? player.headshotPct,
                                acs: profile.acs ?? player.acs,
                              }
                            : player;
                        }),
                      }
                    : current,
                );
              })
              .catch(() => {})
              .finally(() => {
                if (active && profileKey.current === key)
                  setProfileLoading(false);
              });
          } else if (!key) {
            profileKey.current = "";
            setProfileLoading(false);
          }
        }
      } catch (error) {
        if (!active) return;
        profileKey.current = "";
        setProfileLoading(false);
        setMatchError(
          typeof error === "string"
            ? error
            : "Riot Client match data is unavailable.",
        );
        setMatchStatus("error");
      } finally {
        pending = false;
      }
    }

    setMatchStatus("checking");
    void load();
    const timer = window.setInterval(() => void load(), MATCH_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
      profileKey.current = "";
      setProfileLoading(false);
    };
  }, [accountKey, focused, tab]);

  useEffect(() => {
    if ((tab !== "home" && tab !== "match" && tab !== "settings") || !focused)
      return;
    if (!accountKey) {
      statsAccount.current = "";
      setStatsStatus("checking");
      setRangeStatus("checking");
      return;
    }
    let active = true;
    let pending = false;
    const rangeChange = rangeOnly.current;
    const limitChange = seenLimit.current !== limit;
    const refreshChange = seenRefresh.current !== refreshKey;
    const accountChange = statsAccount.current !== accountKey;
    statsAccount.current = accountKey;
    seenLimit.current = limit;
    seenRefresh.current = refreshKey;
    rangeOnly.current = false;
    const loadNow =
      !stats || rangeChange || limitChange || refreshChange || accountChange;
    let force = loadNow;
    let notified = false;
    if (accountChange) {
      setStats(null);
      setStatsError(null);
      setStatsStatus("checking");
      setRangeStatus("checking");
    } else if (!stats && !rangeChange) {
      setStatsStatus("checking");
      setRangeStatus("checking");
    }

    async function load() {
      if (pending) return;
      const ttl =
        statsRef.current?.recentGames && statsRef.current.headshotPct == null
          ? HIT_RETRY_MS
          : STATS_MS;
      if (!force && Date.now() - statsAt.current < ttl) return;
      pending = true;
      try {
        const value = await request<OverviewStats>("stats", { limit });
        if (!active) return;
        force = false;
        statsAt.current = Date.now();
        statsRef.current = value;
        setStats(value);
        setStatsError(null);
        setStatsStatus("ready");
        setRangeStatus("ready");
        if (refreshChange && !notified) {
          notified = true;
          toast.success(
            "Stats refreshed",
            value.rankError ? "Riot didn’t return rank data this time." : undefined,
          );
        }
      } catch (error) {
        if (!active) return;
        force = true;
        setStatsError(
          typeof error === "string"
            ? error
            : "Could not connect to the Riot PVP services. Check that Riot Client is open and signed in.",
        );
        setRangeStatus("error");
        if (!rangeChange) setStatsStatus("error");
        if (refreshChange && !notified) {
          notified = true;
          toast.error("Couldn’t refresh stats", typeof error === "string" ? error : undefined);
        }
      } finally {
        pending = false;
      }
    }

    void load();
    const timer = window.setInterval(() => void load(), STATS_CHECK_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [accountKey, focused, refreshKey, limit, tab, toast]);

  const loadHistory = useCallback(async (reset = false) => {
    if (historyPending.current || (!reset && !historyMore.current)) return;
    const run = historyRun.current;
    historyPending.current = true;
    setHistoryLoading(true);
    setHistoryError(null);
    if (reset) {
      historyOffset.current = 0;
      historyMore.current = true;
      setHistoryHasMore(true);
      setHistory([]);
      setHistoryStatus("checking");
    }

    try {
      const page = await request<MatchPage>("match_history", {
        offset: historyOffset.current,
      }, accountKey);
      if (run !== historyRun.current) return;
      historyOffset.current = page.nextOffset;
      historyMore.current = page.hasMore;
      setHistory((current) =>
        reset ? page.matches : [...current, ...page.matches],
      );
      setHistoryHasMore(page.hasMore);
      setHistoryStatus("ready");
    } catch (error) {
      if (run !== historyRun.current) return;
      const message =
        typeof error === "string"
          ? error
          : "Could not load match history from Riot Client.";
      setHistoryError(message);
      setHistoryStatus((current) => (reset ? "error" : current));
      if (!reset) toast.error("Couldn’t load more matches", message);
    } finally {
      if (run === historyRun.current) {
        historyPending.current = false;
        setHistoryLoading(false);
      }
    }
  }, [accountKey, toast]);

  useEffect(() => {
    const entering = tab === "history" && !historyTab.current;
    historyTab.current = tab === "history";
    if (tab !== "history" || !focused) return;

    const changed = historyAccount.current !== accountKey;
    if (!accountKey) {
      if (changed) {
        historyRun.current += 1;
        historyPending.current = false;
        setHistoryLoading(false);
      }
      historyAccount.current = "";
      historyStarted.current = true;
      historyMore.current = false;
      historyOffset.current = 0;
      setHistory([]);
      setHistoryHasMore(false);
      setHistoryError(null);
      setHistoryStatus("ready");
      return;
    }

    if (changed || !historyStarted.current) {
      historyRun.current += 1;
      historyPending.current = false;
      setHistoryLoading(false);
      historyAccount.current = accountKey;
      historyStarted.current = true;
      historyMore.current = true;
      void loadHistory(true);
    } else if (entering && historyError) {
      void loadHistory(historyStatus === "error");
    }
  }, [accountKey, focused, historyError, historyStatus, loadHistory, tab]);

  const loadMoreHistory = useCallback(() => {
    void loadHistory(false);
  }, [loadHistory]);

  const refresh = useCallback(() => {
    rangeOnly.current = false;
    setStatsStatus("checking");
    setRangeStatus("checking");
    setRefreshKey((key) => key + 1);
  }, []);

  const changeLimit = useCallback((value: number) => {
    rangeOnly.current = true;
    setRangeStatus("checking");
    setLimit(value);
  }, []);

  return {
    account,
    accountStatus,
    stats,
    statsStatus,
    rangeStatus,
    statsError,
    match,
    matchStatus,
    matchError,
    profileLoading,
    history,
    historyStatus,
    historyError,
    historyHasMore,
    historyLoading,
    loadMoreHistory,
    limit,
    refresh,
    changeLimit,
  };
}

function mergeMatch(next: CurrentMatch | null, previous: CurrentMatch | null) {
  if (!next || !previous) return next;
  const profiles = new Map(previous.players.map((player) => [player.subject, player]));
  let changed =
    next.matchId !== previous.matchId ||
    next.phase !== previous.phase ||
    next.mapId !== previous.mapId ||
    next.modeId !== previous.modeId ||
    next.queueId !== previous.queueId ||
    next.players.length !== previous.players.length;
  const players = next.players.map((player) => {
    const old = profiles.get(player.subject);
    const merged = old
      ? {
          ...player,
          games: old.games,
          wins: old.wins,
          kd: old.kd,
          headshotPct: old.headshotPct,
          acs: old.acs,
        }
      : player;
    const unchanged = old != null && samePlayer(merged, old);
    if (!unchanged) changed = true;
    return unchanged && old ? old : merged;
  });
  const order = new Map(previous.players.map((player, index) => [player.subject, index]));
  players.sort(
    (a, b) =>
      (order.get(a.subject) ?? Number.MAX_SAFE_INTEGER) -
      (order.get(b.subject) ?? Number.MAX_SAFE_INTEGER),
  );
  if (players.some((player, index) => previous.players[index]?.subject !== player.subject))
    changed = true;

  return changed ? { ...next, players } : previous;
}

function samePlayer(
  a: CurrentMatch["players"][number],
  b: CurrentMatch["players"][number],
) {
  return (
    a.subject === b.subject &&
    a.name === b.name &&
    a.tagLine === b.tagLine &&
    a.playerCardId === b.playerCardId &&
    a.agentId === b.agentId &&
    a.team === b.team &&
    a.tier === b.tier &&
    a.level === b.level &&
    a.games === b.games &&
    a.wins === b.wins &&
    a.kd === b.kd &&
    a.headshotPct === b.headshotPct &&
    a.acs === b.acs &&
    a.selection === b.selection &&
    a.partyGroup === b.partyGroup &&
    a.you === b.you &&
    a.hidden === b.hidden
  );
}

function sameAccount(a: Account | null, b: Account | null) {
  return (
    a === b ||
    (a != null &&
      b != null &&
      a.gameName === b.gameName &&
      a.tagLine === b.tagLine &&
      a.subject === b.subject &&
      a.playerCardId === b.playerCardId)
  );
}

