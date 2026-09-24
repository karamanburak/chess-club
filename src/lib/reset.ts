/**
 * Bulk deletes for the admin "Danger zone". Every function edits the database in place and
 * returns what it removed, so the caller can log it. Ratings are not touched here: the caller
 * runs recomputeRatings() afterwards, as with every other change to games.
 *
 * Nothing here takes a snapshot; the actions do that via replaceDb() before saving.
 */
import { pruneChallenges } from "./challenges";
import type { Database, Season } from "./types";
import { localDay } from "./time";

export type ResetScope = "everything" | "history" | "tournaments" | "sessions" | "friendlies";

export interface ResetSummary {
  players: number;
  games: number;
  tournaments: number;
  sessions: number;
}

export function freshSeason(today = localDay()): Season {
  return { id: `season-${today}`, name: `Season ${today.slice(0, 4)}`, start: today, end: null, championId: null };
}

/** How many of each thing a scope would remove. Used by the admin page to label the buttons. */
export function resetCounts(db: Database, scope: ResetScope): ResetSummary {
  const friendlies = db.games.filter((g) => !g.tournamentId && !g.sessionId).length;
  const tournamentGames = db.games.filter((g) => !!g.tournamentId).length;
  const sessionGames = db.games.filter((g) => !g.tournamentId && !!g.sessionId).length;
  switch (scope) {
    case "everything":
      return { players: db.players.length, games: db.games.length, tournaments: db.tournaments.length, sessions: db.sessions.length };
    case "history":
      return { players: 0, games: db.games.length, tournaments: db.tournaments.length, sessions: db.sessions.length };
    case "tournaments":
      return { players: 0, games: tournamentGames, tournaments: db.tournaments.length, sessions: 0 };
    case "sessions":
      return { players: 0, games: sessionGames, tournaments: 0, sessions: db.sessions.length };
    case "friendlies":
      return { players: 0, games: friendlies, tournaments: 0, sessions: 0 };
  }
}

/**
 * Wipes the club: players, games, tournaments, club nights, seasons and the activity log.
 * Settings survive (club identity, admin password, member code, language, start Elo), and a fresh season opens today.
 */
export function resetEverything(db: Database, today?: string): ResetSummary {
  const summary = resetCounts(db, "everything");
  db.players = [];
  db.games = [];
  db.tournaments = [];
  db.sessions = [];
  db.seasons = [freshSeason(today)];
  db.activity = [];
  db.puzzleSolves = [];
  db.seq = 0;
  return summary;
}

/**
 * Keeps the players (names, PINs, avatars, notes) but forgets everything they played:
 * games, tournaments, club nights, seasons and puzzle days go, a fresh season opens today. Ratings fall back to
 * each player's starting rating once the caller replays the (now empty) game list.
 */
export function resetHistory(db: Database, today?: string): ResetSummary {
  const summary = resetCounts(db, "history");
  db.games = [];
  db.tournaments = [];
  db.sessions = [];
  db.seasons = [freshSeason(today)];
  db.puzzleSolves = [];
  db.seq = 0;
  return summary;
}

/** Removes every tournament together with its games. Friendlies and club nights stay. */
export function deleteAllTournaments(db: Database): ResetSummary {
  const summary = resetCounts(db, "tournaments");
  db.games = db.games.filter((g) => !g.tournamentId);
  db.tournaments = [];
  return summary;
}

/** Removes every club night together with its games. Tournaments and friendlies stay. */
export function deleteAllSessions(db: Database): ResetSummary {
  const summary = resetCounts(db, "sessions");
  db.games = db.games.filter((g) => !!g.tournamentId || !g.sessionId);
  db.sessions = [];
  return summary;
}

/** Removes every friendly game (not part of a tournament or club night). */
export function deleteAllFriendlies(db: Database): ResetSummary {
  const summary = resetCounts(db, "friendlies");
  db.games = db.games.filter((g) => !!g.tournamentId || !!g.sessionId);
  return summary;
}

export function applyReset(db: Database, scope: ResetScope, today?: string): ResetSummary {
  const summary = (() => {
    switch (scope) {
      case "everything":
        return resetEverything(db, today);
      case "history":
        return resetHistory(db, today);
      case "tournaments":
        return deleteAllTournaments(db);
      case "sessions":
        return deleteAllSessions(db);
      case "friendlies":
        return deleteAllFriendlies(db);
    }
  })();
  // Challenges of removed players, and played ones whose game went, go too; open ones between remaining players stay.
  pruneChallenges(db);
  return summary;
}

export const RESET_SCOPES: readonly ResetScope[] = ["everything", "history", "tournaments", "sessions", "friendlies"];

export function isResetScope(x: unknown): x is ResetScope {
  return typeof x === "string" && (RESET_SCOPES as readonly string[]).includes(x);
}
