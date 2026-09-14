/** "+/-" = white wins by forfeit, "-/+" = black wins by forfeit. Forfeits count for standings, not for Elo. */
export type GameResult = "1-0" | "0-1" | "1/2-1/2" | "+/-" | "-/+";

export type TiebreakKey = "buchholz" | "sonneborn" | "direct" | "progressive" | "wins" | "blackwins";

export interface Player {
  id: string;
  name: string;
  /** Rating the player was created with; ratings are replayed from here. */
  initialRating: number;
  rating: number;
  gamesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  active: boolean;
  createdAt: string;
  note?: string;
  /** Avatar seed, see src/lib/avatar.ts. Always set after migrate(). */
  avatar: string;
  /** Four-digit PIN (scrypt hash) that lets the player claim their identity on a device. Unset until first claim or admin reset. */
  pinHash?: string;
  pinFails?: number;
  pinLockedUntil?: string | null;
}

export interface Game {
  id: string;
  seq: number;
  tournamentId: string | null;
  round: number | null;
  board: number | null;
  sessionId: string | null;
  whiteId: string;
  blackId: string;
  result: GameResult | null;
  rated: boolean;
  createdAt: string;
  completedAt: string | null;
  whiteRatingBefore: number | null;
  blackRatingBefore: number | null;
  whiteRatingAfter: number | null;
  blackRatingAfter: number | null;
}

export interface Pairing {
  board: number;
  whiteId: string;
  blackId: string;
  gameId: string;
}

export interface Round {
  number: number;
  pairings: Pairing[];
  byePlayerId: string | null;
  createdAt: string;
}

export type TournamentStatus = "planned" | "running" | "finished";
export type PairingMode = "random" | "swiss" | "roundrobin" | "knockout";

export interface KnockoutMatch {
  id: string;
  /** 1-based bracket round. */
  round: number;
  /** Position within the round, 1-based; decides who meets whom next round. */
  slot: number;
  a: string | null;
  b: string | null;
  seedA: number | null;
  seedB: number | null;
  /** Games in playing order: base games first, then tiebreaks. */
  gameIds: string[];
  winnerId: string | null;
  thirdPlace: boolean;
}

export interface KnockoutConfig {
  gamesPerMatch: 1 | 2;
  thirdPlace: boolean;
  bracketSize: number;
  matches: KnockoutMatch[];
}

export interface Tournament {
  id: string;
  name: string;
  date: string;
  status: TournamentStatus;
  pairingMode: PairingMode;
  plannedRounds: number;
  rated: boolean;
  timeControl: string;
  tiebreaks: TiebreakKey[];
  byePoints: number;
  participantIds: string[];
  withdrawnIds: string[];
  /** Seeding order used to derive the Berger round-robin schedule. Set when the tournament starts. */
  rrOrder?: string[];
  knockout?: KnockoutConfig;
  rounds: Round[];
  createdAt: string;
}

export interface SessionRound {
  number: number;
  pairings: Pairing[];
  byePlayerId: string | null;
  createdAt: string;
}

/** A club night: the people present, and the rounds played that evening. */
export interface ClubSession {
  id: string;
  createdAt: string;
  closedAt: string | null;
  presentIds: string[];
  rated: boolean;
  avoidRematches: boolean;
  rounds: SessionRound[];
}

/** Who we are: shown in the header, on the home page and on the TV screen. */
export interface ClubInfo {
  name: string;
  motto: string;
  /** Free text, e.g. "2024". */
  founded: string;
  /** Free text, e.g. "Thursdays 18:00, Room 3.14". */
  meets: string;
  /** ISO date of the next club night, or "". */
  nextNight: string;
  /** Short announcement for the notice board, or "". */
  announcement: string;
}

/** A stretch of club life with its own table and, once closed, a champion. */
export interface Season {
  id: string;
  name: string;
  start: string;
  end: string | null;
  championId: string | null;
}

export interface Settings {
  startRating: number;
  byePoints: number;
  defaultTiebreaks: TiebreakKey[];
  club: ClubInfo;
  adminPasswordHash?: string;
  /** Club-wide member code (scrypt hash). Unset = no code asked, open club. */
  memberCodeHash?: string;
  sessionSecret?: string;
}

/** One line in the activity log: what changed and whether the admin did it. */
export interface ActivityEntry {
  id: string;
  at: string;
  admin: boolean;
  text: string;
}

export interface Database {
  version: 2;
  seq: number;
  players: Player[];
  games: Game[];
  tournaments: Tournament[];
  sessions: ClubSession[];
  seasons: Season[];
  activity: ActivityEntry[];
  settings: Settings;
}
