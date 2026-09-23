/**
 * Consistency report over the club data: dangling references, games that point elsewhere,
 * knockout winners who never played, ratings that disagree with a replay. Read-only: it works on
 * copies and never touches the database it is given. Shown on the Admin page and by the
 * `inspect-db` skill.
 */
import { fmt } from "./i18n";
import { migrate } from "./db";
import { recomputeRatings } from "./elo";
import type { Database } from "./types";

export const DEFAULT_HEALTH_MSGS = {
  notMigrated: "Stored data is not in the current shape yet; it is upgraded on the next write.",
  whiteMissing: "Game {game}: white player {id} does not exist.",
  blackMissing: "Game {game}: black player {id} does not exist.",
  selfPlay: "Game {game}: {name} plays themselves.",
  resultNoDate: "Game {game}: has a result but no completion time.",
  dateNoResult: "Game {game}: has a completion time but no result.",
  tournamentMissing: "Game {game}: tournament {id} does not exist.",
  sessionMissing: "Game {game}: club night {id} does not exist.",
  duplicateSeq: "Two games share the sequence number {seq}.",
  seqAhead: "Game {game} has sequence {seq}, above the club counter {max}.",
  participantMissing: "Tournament {tournament}: participant {id} does not exist.",
  boardGameMissing: "Tournament {tournament}, round {round}, board {board}: game {game} is missing.",
  boardGameElsewhere: "Tournament {tournament}, round {round}: game {game} belongs to another tournament or round.",
  byeNotParticipant: "Tournament {tournament}, round {round}: bye {name} is not a participant.",
  koGameMissing: "Knockout {tournament}, round {round} match {slot}: game {game} is missing.",
  koWinnerNeither: "Knockout {tournament}, round {round} match {slot}: winner {name} is neither side.",
  presentMissing: "Club night {session}: present player {id} does not exist.",
  sessionGameMissing: "Club night {session}, round {round}: game {game} is missing.",
  challengePlayerMissing: "Challenge {challenge}: player {id} does not exist.",
  challengeGameMissing: "Challenge {challenge}: marked played, but game {game} is missing.",
  ratingDrift: "Player {name}: stored {stored} but a replay gives {replay}. A write skipped the rating recompute; the next result fixes it.",
};
export type HealthMsgs = typeof DEFAULT_HEALTH_MSGS;

export interface HealthProblem {
  /** Which check fired; stable for tests and for grouping. */
  code: keyof HealthMsgs;
  text: string;
}

export interface HealthReport {
  summary: {
    players: number;
    activePlayers: number;
    withPin: number;
    games: number;
    completed: number;
    open: number;
    tournaments: number;
    runningTournaments: number;
    sessions: number;
    openSessions: number;
    seasons: number;
  };
  problems: HealthProblem[];
}

export function checkHealth(input: Database, m: HealthMsgs = DEFAULT_HEALTH_MSGS, raw?: unknown): HealthReport {
  const db: Database = structuredClone(input);
  const problems: HealthProblem[] = [];
  const warn = (code: keyof HealthMsgs, vars: Record<string, string | number | null | undefined> = {}) => problems.push({ code, text: fmt(m[code], vars) });

  const playerIds = new Set(db.players.map((p) => p.id));
  const gameIds = new Set(db.games.map((g) => g.id));
  const name = (id: string) => db.players.find((p) => p.id === id)?.name ?? `<${id}>`;
  const short = (id: string) => id.slice(0, 8);

  if (raw !== undefined && JSON.stringify(migrate(structuredClone(raw))) !== JSON.stringify(raw)) warn("notMigrated");

  for (const g of db.games) {
    if (!playerIds.has(g.whiteId)) warn("whiteMissing", { game: short(g.id), id: g.whiteId });
    if (!playerIds.has(g.blackId)) warn("blackMissing", { game: short(g.id), id: g.blackId });
    if (g.whiteId === g.blackId) warn("selfPlay", { game: short(g.id), name: name(g.whiteId) });
    if (g.result && !g.completedAt) warn("resultNoDate", { game: short(g.id) });
    if (!g.result && g.completedAt) warn("dateNoResult", { game: short(g.id) });
    if (g.tournamentId && !db.tournaments.some((t) => t.id === g.tournamentId)) warn("tournamentMissing", { game: short(g.id), id: g.tournamentId });
    if (g.sessionId && !db.sessions.some((s) => s.id === g.sessionId)) warn("sessionMissing", { game: short(g.id), id: g.sessionId });
  }
  const seqs = new Set<number>();
  for (const g of db.games) {
    if (seqs.has(g.seq)) warn("duplicateSeq", { seq: g.seq });
    seqs.add(g.seq);
    if (g.seq > db.seq) warn("seqAhead", { game: short(g.id), seq: g.seq, max: db.seq });
  }
  for (const t of db.tournaments) {
    for (const pid of [...t.participantIds, ...t.withdrawnIds]) if (!playerIds.has(pid)) warn("participantMissing", { tournament: t.name, id: pid });
    for (const r of t.rounds) {
      for (const p of r.pairings) {
        if (!gameIds.has(p.gameId)) warn("boardGameMissing", { tournament: t.name, round: r.number, board: p.board, game: short(p.gameId) });
        const g = db.games.find((x) => x.id === p.gameId);
        if (g && (g.tournamentId !== t.id || g.round !== r.number)) warn("boardGameElsewhere", { tournament: t.name, round: r.number, game: short(p.gameId) });
      }
      if (r.byePlayerId && !t.participantIds.includes(r.byePlayerId)) warn("byeNotParticipant", { tournament: t.name, round: r.number, name: name(r.byePlayerId) });
    }
    for (const km of t.knockout?.matches ?? []) {
      for (const gid of km.gameIds) if (!gameIds.has(gid)) warn("koGameMissing", { tournament: t.name, round: km.round, slot: km.slot, game: short(gid) });
      if (km.winnerId && km.winnerId !== km.a && km.winnerId !== km.b) warn("koWinnerNeither", { tournament: t.name, round: km.round, slot: km.slot, name: name(km.winnerId) });
    }
  }
  for (const s of db.sessions) {
    for (const pid of s.presentIds) if (!playerIds.has(pid)) warn("presentMissing", { session: short(s.id), id: pid });
    for (const r of s.rounds) for (const p of r.pairings) if (!gameIds.has(p.gameId)) warn("sessionGameMissing", { session: short(s.id), round: r.number, game: short(p.gameId) });
  }
  for (const c of db.challenges) {
    for (const pid of [c.fromId, c.toId]) if (!playerIds.has(pid)) warn("challengePlayerMissing", { challenge: short(c.id), id: pid });
    if (c.status === "played" && c.gameId && !gameIds.has(c.gameId)) warn("challengeGameMissing", { challenge: short(c.id), game: short(c.gameId) });
    for (const gid of c.gameIds ?? []) if (!gameIds.has(gid)) warn("challengeGameMissing", { challenge: short(c.id), game: short(gid) });
  }

  const replay = structuredClone(db);
  recomputeRatings(replay);
  for (const p of db.players) {
    const q = replay.players.find((x) => x.id === p.id)!;
    const keys = (["rating", "gamesPlayed", "wins", "draws", "losses"] as const).filter((k) => p[k] !== q[k]);
    if (keys.length) warn("ratingDrift", { name: p.name, stored: keys.map((k) => `${k}=${p[k]}`).join(", "), replay: keys.map((k) => `${k}=${q[k]}`).join(", ") });
  }

  const completed = db.games.filter((g) => g.result !== null).length;
  return {
    summary: {
      players: db.players.length,
      activePlayers: db.players.filter((p) => p.active).length,
      withPin: db.players.filter((p) => p.pinHash).length,
      games: db.games.length,
      completed,
      open: db.games.length - completed,
      tournaments: db.tournaments.length,
      runningTournaments: db.tournaments.filter((t) => t.status === "running").length,
      sessions: db.sessions.length,
      openSessions: db.sessions.filter((s) => !s.closedAt).length,
      seasons: db.seasons.length,
    },
    problems,
  };
}
