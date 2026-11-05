export type OverviewStats = {
  currentTier: number | null;
  peakTier: number | null;
  peakActId: string | null;
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
  matchId: string;
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
  headshots: number | null;
  bodyshots: number | null;
  legshots: number | null;
  mvp: boolean;
  matchMvp: boolean;
  competitive: boolean;
  rr: number | null;
  tier: number | null;
  rankChange: number | null;
};

export type MatchDetails = {
  matchId: string;
  mapId: string;
  queue: string | null;
  mode: string | null;
  started: number | null;
  duration: number | null;
  roundsWon: number | null;
  roundsLost: number | null;
  players: MatchDetailPlayer[];
};

export type MatchDetailPlayer = {
  subject: string;
  name: string;
  tagLine: string | null;
  playerCardId: string | null;
  you: boolean;
  hidden: boolean;
  team: string;
  agentId: string | null;
  tier: number | null;
  level: number | null;
  kills: number;
  deaths: number;
  assists: number;
  score: number;
  rounds: number;
  headshots: number;
  bodyshots: number;
  legshots: number;
};

export type MatchPage = {
  matches: RecentMatch[];
  nextOffset: number;
  hasMore: boolean;
};

export type LoadStatus = "checking" | "ready" | "error";
export type StatsStatus = LoadStatus;

export type AccountStatus = "checking" | "connected" | "offline";

export type Account = {
  gameName: string;
  tagLine: string;
  subject: string;
  playerCardId: string;
};

export type Tier = {
  tier: number;
  tierName: string;
  largeIcon?: string | null;
  smallIcon?: string | null;
};

export type MatchPlayer = {
  subject: string;
  name: string;
  tagLine: string | null;
  playerCardId: string | null;
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
  partyGroup: number | null;
  you: boolean;
  hidden: boolean;
};

export type WeaponLoadout = {
  weaponId: string;
  itemIds: string[];
};

export type PlayerStats = {
  playerCardId: string | null;
  currentTier: number | null;
  peakTier: number | null;
  peakActId: string | null;
  rating: number | null;
  level: number | null;
  games: number | null;
  wins: number | null;
  kd: number | null;
  headshotPct: number | null;
  acs: number | null;
};

export type CurrentMatch = {
  matchId: string;
  phase: "live" | "pregame";
  mapId: string;
  modeId: string;
  queueId: string | null;
  players: MatchPlayer[];
};

export type MatchStatus = "checking" | "ready" | "error";
