export type OverviewStats = {
  currentTier: number | null;
  peakTier: number | null;
  games: number | null;
  wins: number | null;
  rating: number | null;
  kd: number | null;
  headshotPct: number | null;
  bodyshotPct: number | null;
  legshotPct: number | null;
  headshots: number | null;
  bodyshots: number | null;
  legshots: number | null;
  agent: string | null;
  agentGames: number | null;
  recentGames: number | null;
  recentMatches: RecentMatch[];
  rankError: string | null;
  matchError: string | null;
};

export type RecentMatch = {
  mapId: string;
  queue: string | null;
  mode: string | null;
  agentId: string | null;
  started: number | null;
  won: boolean | null;
  roundsWon: number | null;
  roundsLost: number | null;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  kd: number | null;
  acs: number | null;
  score: number | null;
  mvp: boolean;
  competitive: boolean;
  rr: number | null;
  tier: number | null;
};

export type StatsStatus = "checking" | "ready" | "error";

export type AccountStatus = "checking" | "connected" | "offline";

export type ValAcc = {
  gameName: string;
  tagLine: string;
  playerCardId: string;
  cardError: string | null;
};

export type MatchPlayer = {
  name: string;
  tagLine: string | null;
  agentId: string | null;
  team: string;
  tier: number | null;
  level: number | null;
  games: number | null;
  wins: number | null;
  kd: number | null;
  headshotPct: number | null;
  acs: number | null;
  selection: string | null;
  you: boolean;
  hidden: boolean;
};

export type CurrentMatch = {
  phase: "live" | "pregame";
  mapId: string;
  modeId: string;
  queueId: string | null;
  players: MatchPlayer[];
};

export type MatchStatus = "checking" | "ready" | "error";
