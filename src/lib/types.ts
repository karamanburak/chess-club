import type { Lockout } from "./lockout";

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
  /** PIN locks since the last right PIN; each doubles the next (lockout.ts). */
  pinLocks?: number;
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
  /** Club default UI language; a device can override it with the cc_lang cookie. */
  language?: "en" | "de";
  adminPasswordHash?: string;
  /** Second, rarer password that gates the destructive admin tools (danger zone, import/restore, member code, passwords). Unset = admin suffices. */
  ownerPasswordHash?: string;
  /** Club-wide member code (scrypt hash). Unset = no code asked, open club. */
  memberCodeHash?: string;
  /** Switches on Admin (unset = on): "I am new, join the club", the admin's phone feed, challenge news in Slack. */
  selfSignupOff?: boolean;
  clubNotifyOff?: boolean;
  slackOff?: boolean;
  sessionSecret?: string;
  /** Brute-force brakes for the admin password and the member code (see src/lib/lockout.ts). */
  adminLock?: Lockout;
  memberLock?: Lockout;
  ownerLock?: Lockout;
}

export type ChallengeStatus = "pending" | "accepted" | "declined" | "played" | "cancelled" | "expired";

/**
 * A game two members agreed to play: one proposes a date, the other accepts, declines or proposes
 * another time. Once played, the result becomes a friendly game (`gameId`).
 */
/**
 * A challenge for a block of time instead of one game ("two hours of 3+2"). The sender picks the length and how it
 * is scored: `each` enters every game on its own (each one a rated friendly, colours alternating), `single` counts
 * the whole session as one game, recorded like a normal challenge.
 */
export interface ChallengeSession {
  minutes: number;
  scoring: "each" | "single";
}

export interface Challenge {
  id: string;
  /** Who issued the challenge. */
  fromId: string;
  toId: string;
  /** ISO datetime the game is proposed for. */
  at: string;
  place: string;
  timeControl: string;
  note: string;
  status: ChallengeStatus;
  /** Who made the current proposal; only the other side can accept it. */
  proposedBy: string;
  /** Drawn at random when the challenge is accepted; null until then. The other player has black. */
  whiteId: string | null;
  /** Agreed when the challenge is sent: does the game move Elo? Copied onto the recorded game. */
  rated: boolean;
  gameId: string | null;
  /** Set for a session; absent or null for a single game. */
  session?: ChallengeSession | null;
  /** The games of an `each` session, in the order they were played. */
  gameIds?: string[];
  createdAt: string;
  updatedAt: string;
}

/** One line in the activity log: what changed and whether the admin did it. */
export interface ActivityEntry {
  id: string;
  at: string;
  admin: boolean;
  text: string;
}

/**
 * A claimed player's daily-puzzle outcome, one per player and day. `solved` counts for the streak (a hint is allowed
 * and noted), `shown` means they gave up and looked at the solution. Details are for the admin only; the public
 * Hall of Fame shows days and streaks.
 */
export interface PuzzleSolve {
  day: string;
  playerId: string;
  puzzleId: string;
  result: "solved" | "shown";
  /** Wrong moves before the solution. */
  misses: number;
  hint: boolean;
  at: string;
}

export interface Database {
  version: 2;
  seq: number;
  players: Player[];
  games: Game[];
  tournaments: Tournament[];
  sessions: ClubSession[];
  seasons: Season[];
  challenges: Challenge[];
  puzzleSolves: PuzzleSolve[];
  activity: ActivityEntry[];
  settings: Settings;
}
