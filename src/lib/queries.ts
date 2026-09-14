import type { ClubSession, Database, Game, GameResult, Player, TiebreakKey, Tournament } from "./types";
import { EMPTY_COLOR, pairKey, type ColorStats } from "./pairing";
import { countsForRating, isForfeit, performanceRating, PROVISIONAL_GAMES, recomputeRatings, scoreFor } from "./elo";

/* ------------------------------------------------------------------ */
/* Basics                                                              */
/* ------------------------------------------------------------------ */

export function playerMap(db: Database): Map<string, Player> {
  return new Map(db.players.map((p) => [p.id, p]));
}

export function leaderboard(db: Database, includeInactive = false): Player[] {
  return db.players
    .filter((p) => includeInactive || p.active)
    .sort((a, b) => b.rating - a.rating || b.gamesPlayed - a.gamesPlayed || a.name.localeCompare(b.name));
}

export function isProvisional(p: Player): boolean {
  return p.gamesPlayed < PROVISIONAL_GAMES;
}

/** Completed games, newest first. */
export function completedGames(db: Database): Game[] {
  return db.games
    .filter((g) => g.result !== null)
    .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? "") || b.seq - a.seq);
}

export function gamesForPlayer(db: Database, playerId: string): Game[] {
  return completedGames(db).filter((g) => g.whiteId === playerId || g.blackId === playerId);
}

export function playerScore(g: Game, playerId: string): number | null {
  if (!g.result) return null;
  return scoreFor(g.result, g.whiteId === playerId ? "white" : "black");
}

export function opponentOf(g: Game, playerId: string): string {
  return g.whiteId === playerId ? g.blackId : g.whiteId;
}

/* ------------------------------------------------------------------ */
/* Ratings over time                                                   */
/* ------------------------------------------------------------------ */

export interface RatingPoint {
  date: string;
  rating: number;
  gameId: string | null;
  opponentId?: string;
  score?: number;
}

export function ratingHistory(db: Database, player: Player): RatingPoint[] {
  const points: RatingPoint[] = [{ date: player.createdAt, rating: player.initialRating, gameId: null }];
  const games = gamesForPlayer(db, player.id)
    .filter(countsForRating)
    .slice()
    .reverse();
  for (const g of games) {
    const after = g.whiteId === player.id ? g.whiteRatingAfter : g.blackRatingAfter;
    if (after !== null) {
      points.push({ date: g.completedAt, rating: after, gameId: g.id, opponentId: opponentOf(g, player.id), score: playerScore(g, player.id) ?? undefined });
    }
  }
  return points;
}

/** Ratings as they stood at a given moment, by replaying only the games completed before it. */
export function ratingsAsOf(db: Database, isoDate: string): Map<string, number> {
  const clone: Database = JSON.parse(JSON.stringify(db));
  clone.games = clone.games.filter((g) => g.completedAt !== null && g.completedAt <= isoDate);
  recomputeRatings(clone);
  return new Map(clone.players.map((p) => [p.id, p.rating]));
}

/** Rank change of active players compared to `daysAgo`. Positive = moved up. */
export function rankChanges(db: Database, daysAgo = 7): Map<string, number> {
  const then = new Date(Date.now() - daysAgo * 86400_000).toISOString();
  const old = ratingsAsOf(db, then);
  const active = db.players.filter((p) => p.active);
  const nowOrder = [...active].sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name)).map((p) => p.id);
  const thenOrder = [...active].sort((a, b) => (old.get(b.id) ?? 0) - (old.get(a.id) ?? 0) || a.name.localeCompare(b.name)).map((p) => p.id);
  const out = new Map<string, number>();
  for (const id of nowOrder) out.set(id, thenOrder.indexOf(id) - nowOrder.indexOf(id));
  return out;
}

/* ------------------------------------------------------------------ */
/* Colors, rematches, form                                             */
/* ------------------------------------------------------------------ */

/** Color statistics across all games (pending included), optionally limited to one tournament or session. */
export function colorStats(db: Database, scope?: { tournamentId?: string; sessionId?: string }): Map<string, ColorStats> {
  const map = new Map<string, ColorStats>();
  const bump = (id: string, color: "white" | "black") => {
    const s = { ...(map.get(id) ?? EMPTY_COLOR) };
    s[color] += 1;
    s.streak = s.last === color ? s.streak + 1 : 1;
    s.last = color;
    map.set(id, s);
  };
  const games = db.games
    .filter((g) => (scope?.tournamentId ? g.tournamentId === scope.tournamentId : true))
    .filter((g) => (scope?.sessionId ? g.sessionId === scope.sessionId : true))
    .filter((g) => !isForfeit(g.result))
    .sort((a, b) => a.seq - b.seq);
  for (const g of games) {
    bump(g.whiteId, "white");
    bump(g.blackId, "black");
  }
  return map;
}

export function previousPairs(db: Database, scope?: { tournamentId?: string; sessionId?: string }): Set<string> {
  const set = new Set<string>();
  for (const g of db.games) {
    if (scope?.tournamentId && g.tournamentId !== scope.tournamentId) continue;
    if (scope?.sessionId && g.sessionId !== scope.sessionId) continue;
    set.add(pairKey(g.whiteId, g.blackId));
  }
  return set;
}

export type FormMark = "W" | "D" | "L";

/** Last N results of a player as W/D/L, oldest first. */
export function recentForm(db: Database, playerId: string, n = 5): FormMark[] {
  return gamesForPlayer(db, playerId)
    .filter(countsForRating)
    .slice(0, n)
    .reverse()
    .map((g) => {
      const s = playerScore(g, playerId)!;
      return s === 1 ? "W" : s === 0 ? "L" : "D";
    });
}

/** Rating change over the last N rated games. */
export function ratingTrend(db: Database, playerId: string, n = 5): number | null {
  const games = gamesForPlayer(db, playerId).filter(countsForRating).slice(0, n);
  if (!games.length) return null;
  const newest = games[0];
  const oldest = games[games.length - 1];
  const after = newest.whiteId === playerId ? newest.whiteRatingAfter : newest.blackRatingAfter;
  const before = oldest.whiteId === playerId ? oldest.whiteRatingBefore : oldest.blackRatingBefore;
  if (after === null || before === null) return null;
  return after - before;
}

export interface Streaks {
  current: { kind: FormMark; length: number } | null;
  longestWin: number;
  unbeaten: number;
}

export function streaks(db: Database, playerId: string): Streaks {
  const games = gamesForPlayer(db, playerId).filter(countsForRating); // newest first
  let current: Streaks["current"] = null;
  for (const g of games) {
    const s = playerScore(g, playerId)!;
    const kind: FormMark = s === 1 ? "W" : s === 0 ? "L" : "D";
    if (!current) current = { kind, length: 1 };
    else if (current.kind === kind) current.length++;
    else break;
  }
  let longestWin = 0;
  let run = 0;
  let unbeaten = 0;
  let unbeatenRun = 0;
  for (const g of [...games].reverse()) {
    const s = playerScore(g, playerId)!;
    run = s === 1 ? run + 1 : 0;
    unbeatenRun = s > 0 ? unbeatenRun + 1 : 0;
    longestWin = Math.max(longestWin, run);
    unbeaten = Math.max(unbeaten, unbeatenRun);
  }
  return { current, longestWin, unbeaten };
}

/* ------------------------------------------------------------------ */
/* Head-to-head                                                        */
/* ------------------------------------------------------------------ */

export interface H2H {
  a: string;
  b: string;
  games: Game[];
  aWins: number;
  draws: number;
  bWins: number;
  aPoints: number;
  bPoints: number;
}

export function headToHead(db: Database, a: string, b: string): H2H {
  const games = completedGames(db).filter((g) => (g.whiteId === a && g.blackId === b) || (g.whiteId === b && g.blackId === a));
  let aWins = 0;
  let draws = 0;
  let bWins = 0;
  for (const g of games) {
    const s = playerScore(g, a)!;
    if (s === 1) aWins++;
    else if (s === 0) bWins++;
    else draws++;
  }
  return { a, b, games, aWins, draws, bWins, aPoints: aWins + draws / 2, bPoints: bWins + draws / 2 };
}

export interface Rival {
  opponentId: string;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  lastGame: Game;
}

export function rivals(db: Database, playerId: string): Rival[] {
  const map = new Map<string, Rival>();
  for (const g of gamesForPlayer(db, playerId)) {
    const opp = opponentOf(g, playerId);
    const s = playerScore(g, playerId)!;
    let r = map.get(opp);
    if (!r) {
      r = { opponentId: opp, games: 0, wins: 0, draws: 0, losses: 0, lastGame: g };
      map.set(opp, r);
    }
    r.games++;
    if (s === 1) r.wins++;
    else if (s === 0) r.losses++;
    else r.draws++;
  }
  return [...map.values()].sort((x, y) => y.games - x.games || y.wins - x.wins);
}

/* ------------------------------------------------------------------ */
/* Tournament standings, tiebreaks, crosstable                         */
/* ------------------------------------------------------------------ */

export const TIEBREAK_LABELS: Record<TiebreakKey, { short: string; label: string; help: string }> = {
  buchholz: { short: "Bh", label: "Buchholz", help: "Sum of all opponents' points" },
  sonneborn: { short: "SB", label: "Sonneborn-Berger", help: "Points of beaten opponents plus half the points of drawn opponents" },
  direct: { short: "DE", label: "Direct encounter", help: "Result of the games between the tied players" },
  progressive: { short: "Prog", label: "Progressive", help: "Sum of the running score after each round; rewards early wins" },
  wins: { short: "Wins", label: "Number of wins", help: "More wins ranks higher" },
  blackwins: { short: "BW", label: "Wins with black", help: "More wins with black ranks higher" },
};

export const TIEBREAK_PRESETS: { key: string; label: string; order: TiebreakKey[] }[] = [
  { key: "club", label: "Buchholz → SB → Direct → Wins", order: ["buchholz", "sonneborn", "direct", "wins"] },
  { key: "sb", label: "SB → Direct → Buchholz", order: ["sonneborn", "direct", "buchholz", "wins"] },
  { key: "direct", label: "Direct → Buchholz → SB", order: ["direct", "buchholz", "sonneborn", "wins"] },
  { key: "prog", label: "Progressive → Buchholz → Wins", order: ["progressive", "buchholz", "wins"] },
  { key: "rr", label: "Round robin: Direct → SB → Wins → Black wins", order: ["direct", "sonneborn", "wins", "blackwins"] },
];

export interface StandingRow {
  playerId: string;
  name: string;
  rating: number;
  points: number;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  blackWins: number;
  byes: number;
  forfeitsWon: number;
  withdrawn: boolean;
  buchholz: number;
  sonneborn: number;
  progressive: number;
  direct: number;
  performance: number | null;
  opponents: string[];
  /** Score per round, `null` when the player did not play (bye or missing). */
  roundScores: (number | null)[];
}

export function standings(db: Database, t: Tournament): StandingRow[] {
  const players = playerMap(db);
  const games = new Map(db.games.map((g) => [g.id, g]));
  const rows = new Map<string, StandingRow>();
  const withdrawn = new Set(t.withdrawnIds);
  for (const id of t.participantIds) {
    const p = players.get(id);
    rows.set(id, {
      playerId: id,
      name: p?.name ?? "Unknown",
      rating: p?.rating ?? 0,
      points: 0,
      games: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      blackWins: 0,
      byes: 0,
      forfeitsWon: 0,
      withdrawn: withdrawn.has(id),
      buchholz: 0,
      sonneborn: 0,
      progressive: 0,
      direct: 0,
      performance: null,
      opponents: [],
      roundScores: [],
    });
  }

  const perGame: { a: string; b: string; sa: number; g: Game }[] = [];
  const oppRatings = new Map<string, number[]>();
  const ratedScore = new Map<string, number>();

  for (const round of t.rounds) {
    for (const r of rows.values()) r.roundScores.push(null);
    const idx = round.number - 1;
    if (round.byePlayerId) {
      const r = rows.get(round.byePlayerId);
      if (r) {
        r.points += t.byePoints;
        r.byes += 1;
        r.roundScores[idx] = t.byePoints;
      }
    }
    for (const pairing of round.pairings) {
      const g = games.get(pairing.gameId);
      if (!g || !g.result) continue;
      const w = rows.get(g.whiteId);
      const b = rows.get(g.blackId);
      const sw = scoreFor(g.result, "white");
      const forfeit = isForfeit(g.result);
      perGame.push({ a: g.whiteId, b: g.blackId, sa: sw, g });
      if (w) {
        w.points += sw;
        w.games += 1;
        w.opponents.push(g.blackId);
        w.roundScores[idx] = sw;
        if (sw === 1) {
          w.wins++;
          if (forfeit) w.forfeitsWon++;
        } else if (sw === 0) w.losses++;
        else w.draws++;
        if (!forfeit) {
          oppRatings.set(g.whiteId, [...(oppRatings.get(g.whiteId) ?? []), g.blackRatingBefore ?? players.get(g.blackId)?.rating ?? 0]);
          ratedScore.set(g.whiteId, (ratedScore.get(g.whiteId) ?? 0) + sw);
        }
      }
      if (b) {
        b.points += 1 - sw;
        b.games += 1;
        b.opponents.push(g.whiteId);
        b.roundScores[idx] = 1 - sw;
        if (sw === 0) {
          b.wins++;
          b.blackWins++;
          if (forfeit) b.forfeitsWon++;
        } else if (sw === 1) b.losses++;
        else b.draws++;
        if (!forfeit) {
          oppRatings.set(g.blackId, [...(oppRatings.get(g.blackId) ?? []), g.whiteRatingBefore ?? players.get(g.whiteId)?.rating ?? 0]);
          ratedScore.set(g.blackId, (ratedScore.get(g.blackId) ?? 0) + (1 - sw));
        }
      }
    }
  }

  for (const r of rows.values()) {
    r.buchholz = r.opponents.reduce((sum, id) => sum + (rows.get(id)?.points ?? 0), 0);
    let running = 0;
    r.progressive = r.roundScores.reduce<number>((sum, s) => {
      running += s ?? 0;
      return sum + running;
    }, 0);
    r.performance = performanceRating(oppRatings.get(r.playerId) ?? [], ratedScore.get(r.playerId) ?? 0);
  }
  for (const { a, b, sa } of perGame) {
    const ra = rows.get(a);
    const rb = rows.get(b);
    if (ra && rb) {
      ra.sonneborn += sa === 1 ? rb.points : sa === 0.5 ? rb.points / 2 : 0;
      rb.sonneborn += sa === 0 ? ra.points : sa === 0.5 ? ra.points / 2 : 0;
    }
  }
  // Direct encounter: among players tied on points, points scored against each other.
  const byPoints = new Map<number, StandingRow[]>();
  for (const r of rows.values()) byPoints.set(r.points, [...(byPoints.get(r.points) ?? []), r]);
  for (const group of byPoints.values()) {
    if (group.length < 2) continue;
    const ids = new Set(group.map((r) => r.playerId));
    for (const { a, b, sa } of perGame) {
      if (ids.has(a) && ids.has(b)) {
        rows.get(a)!.direct += sa;
        rows.get(b)!.direct += 1 - sa;
      }
    }
  }

  const keyOf: Record<TiebreakKey, (r: StandingRow) => number> = {
    buchholz: (r) => r.buchholz,
    sonneborn: (r) => r.sonneborn,
    direct: (r) => r.direct,
    progressive: (r) => r.progressive,
    wins: (r) => r.wins,
    blackwins: (r) => r.blackWins,
  };
  const order = t.tiebreaks.length ? t.tiebreaks : ["buchholz", "wins"];
  return [...rows.values()].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    for (const k of order) {
      const d = keyOf[k as TiebreakKey](b) - keyOf[k as TiebreakKey](a);
      if (d !== 0) return d;
    }
    return b.rating - a.rating || a.name.localeCompare(b.name);
  });
}

export interface CrossCell {
  score: number;
  color: "white" | "black";
  round: number;
  forfeit: boolean;
}

/** For each player: results against each opponent (usually one game, may be several). */
export function crosstable(db: Database, t: Tournament): Map<string, Map<string, CrossCell[]>> {
  const games = new Map(db.games.map((g) => [g.id, g]));
  const table = new Map<string, Map<string, CrossCell[]>>();
  const push = (a: string, b: string, cell: CrossCell) => {
    let row = table.get(a);
    if (!row) {
      row = new Map();
      table.set(a, row);
    }
    row.set(b, [...(row.get(b) ?? []), cell]);
  };
  for (const round of t.rounds) {
    for (const p of round.pairings) {
      const g = games.get(p.gameId);
      if (!g?.result) continue;
      const sw = scoreFor(g.result, "white");
      const forfeit = isForfeit(g.result);
      push(g.whiteId, g.blackId, { score: sw, color: "white", round: round.number, forfeit });
      push(g.blackId, g.whiteId, { score: 1 - sw, color: "black", round: round.number, forfeit });
    }
  }
  return table;
}

export function roundComplete(db: Database, t: Tournament, roundNumber: number): boolean {
  const round = t.rounds.find((r) => r.number === roundNumber);
  if (!round) return false;
  const games = new Map(db.games.map((g) => [g.id, g]));
  return round.pairings.every((p) => games.get(p.gameId)?.result);
}

export function roundHasResults(db: Database, round: { pairings: { gameId: string }[] }): boolean {
  const games = new Map(db.games.map((g) => [g.id, g]));
  return round.pairings.some((p) => games.get(p.gameId)?.result);
}

export function activeParticipants(t: Tournament): string[] {
  const withdrawn = new Set(t.withdrawnIds);
  return t.participantIds.filter((id) => !withdrawn.has(id));
}

export function roundRobinRounds(t: Tournament): number {
  const n = t.participantIds.length;
  return n % 2 === 0 ? n - 1 : n;
}

/* ------------------------------------------------------------------ */
/* Club nights                                                         */
/* ------------------------------------------------------------------ */

export function activeSession(db: Database): ClubSession | null {
  return db.sessions.find((s) => s.closedAt === null) ?? null;
}

export function sessionGames(db: Database, s: ClubSession): Game[] {
  return db.games.filter((g) => g.sessionId === s.id);
}

export function sessionRoundComplete(db: Database, round: { pairings: { gameId: string }[] }): boolean {
  const games = new Map(db.games.map((g) => [g.id, g]));
  return round.pairings.every((p) => games.get(p.gameId)?.result);
}

export interface SessionSummaryRow {
  playerId: string;
  games: number;
  points: number;
  wins: number;
  draws: number;
  losses: number;
  ratingChange: number;
}

export function sessionSummary(db: Database, s: ClubSession): SessionSummaryRow[] {
  const rows = new Map<string, SessionSummaryRow>();
  for (const id of s.presentIds) rows.set(id, { playerId: id, games: 0, points: 0, wins: 0, draws: 0, losses: 0, ratingChange: 0 });
  for (const g of sessionGames(db, s)) {
    if (!g.result) continue;
    for (const id of [g.whiteId, g.blackId]) {
      let r = rows.get(id);
      if (!r) {
        r = { playerId: id, games: 0, points: 0, wins: 0, draws: 0, losses: 0, ratingChange: 0 };
        rows.set(id, r);
      }
      const sc = playerScore(g, id)!;
      r.games++;
      r.points += sc;
      if (sc === 1) r.wins++;
      else if (sc === 0) r.losses++;
      else r.draws++;
      const before = id === g.whiteId ? g.whiteRatingBefore : g.blackRatingBefore;
      const after = id === g.whiteId ? g.whiteRatingAfter : g.blackRatingAfter;
      if (before !== null && after !== null) r.ratingChange += after - before;
    }
  }
  return [...rows.values()].sort((a, b) => b.points - a.points || b.ratingChange - a.ratingChange);
}

/* ------------------------------------------------------------------ */
/* Club-wide statistics                                                */
/* ------------------------------------------------------------------ */

export interface ClubStats {
  games: number;
  decisive: number;
  whiteWins: number;
  blackWins: number;
  draws: number;
  avgRating: number | null;
  mostActive: { playerId: string; games: number } | null;
  biggestUpset: { game: Game; diff: number } | null;
  longestWinStreak: { playerId: string; length: number } | null;
  gamesPerMonth: { month: string; games: number }[];
  highestRating: { playerId: string; rating: number; date: string } | null;
}

export function clubStats(db: Database): ClubStats {
  const games = completedGames(db).filter(countsForRating);
  let whiteWins = 0;
  let blackWins = 0;
  let draws = 0;
  const perPlayer = new Map<string, number>();
  let biggestUpset: ClubStats["biggestUpset"] = null;
  const monthMap = new Map<string, number>();
  let highest: ClubStats["highestRating"] = null;

  for (const g of games) {
    const sw = scoreFor(g.result, "white");
    if (sw === 1) whiteWins++;
    else if (sw === 0) blackWins++;
    else draws++;
    perPlayer.set(g.whiteId, (perPlayer.get(g.whiteId) ?? 0) + 1);
    perPlayer.set(g.blackId, (perPlayer.get(g.blackId) ?? 0) + 1);
    if (g.whiteRatingBefore !== null && g.blackRatingBefore !== null && sw !== 0.5) {
      const winnerBefore = sw === 1 ? g.whiteRatingBefore : g.blackRatingBefore;
      const loserBefore = sw === 1 ? g.blackRatingBefore : g.whiteRatingBefore;
      const diff = loserBefore - winnerBefore;
      if (diff > 0 && (!biggestUpset || diff > biggestUpset.diff)) biggestUpset = { game: g, diff };
    }
    const month = g.completedAt.slice(0, 7);
    monthMap.set(month, (monthMap.get(month) ?? 0) + 1);
    for (const [id, after] of [
      [g.whiteId, g.whiteRatingAfter],
      [g.blackId, g.blackRatingAfter],
    ] as const) {
      if (after !== null && (!highest || after > highest.rating)) highest = { playerId: id, rating: after, date: g.completedAt };
    }
  }

  let mostActive: ClubStats["mostActive"] = null;
  for (const [playerId, n] of perPlayer) if (!mostActive || n > mostActive.games) mostActive = { playerId, games: n };

  let longestWinStreak: ClubStats["longestWinStreak"] = null;
  for (const p of db.players) {
    const s = streaks(db, p.id);
    if (s.longestWin > 0 && (!longestWinStreak || s.longestWin > longestWinStreak.length)) longestWinStreak = { playerId: p.id, length: s.longestWin };
  }

  const active = db.players.filter((p) => p.active);
  return {
    games: games.length,
    decisive: whiteWins + blackWins,
    whiteWins,
    blackWins,
    draws,
    avgRating: active.length ? Math.round(active.reduce((s, p) => s + p.rating, 0) / active.length) : null,
    mostActive,
    biggestUpset,
    longestWinStreak,
    gamesPerMonth: [...monthMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, n]) => ({ month, games: n })),
    highestRating: highest,
  };
}

export interface MonthRow {
  playerId: string;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  ratingChange: number;
}

export function monthsWithGames(db: Database): string[] {
  const set = new Set<string>();
  for (const g of db.games) if (g.completedAt) set.add(g.completedAt.slice(0, 7));
  return [...set].sort().reverse();
}

/** Per-player results within a calendar month (YYYY-MM). */
export function monthTable(db: Database, month: string): MonthRow[] {
  const rows = new Map<string, MonthRow>();
  for (const g of completedGames(db)) {
    if (!g.completedAt?.startsWith(month)) continue;
    for (const id of [g.whiteId, g.blackId]) {
      let r = rows.get(id);
      if (!r) {
        r = { playerId: id, games: 0, wins: 0, draws: 0, losses: 0, points: 0, ratingChange: 0 };
        rows.set(id, r);
      }
      const s = playerScore(g, id)!;
      r.games++;
      r.points += s;
      if (s === 1) r.wins++;
      else if (s === 0) r.losses++;
      else r.draws++;
      const before = id === g.whiteId ? g.whiteRatingBefore : g.blackRatingBefore;
      const after = id === g.whiteId ? g.whiteRatingAfter : g.blackRatingAfter;
      if (before !== null && after !== null) r.ratingChange += after - before;
    }
  }
  return [...rows.values()].sort((a, b) => b.points - a.points || b.ratingChange - a.ratingChange || b.games - a.games);
}

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

export function resultLabel(result: GameResult | null): string {
  if (!result) return "–";
  if (result === "1/2-1/2") return "½–½";
  if (result === "+/-") return "+ / –";
  if (result === "-/+") return "– / +";
  return result.replace("-", "–");
}

export function scoreLabel(score: number | null | undefined): string {
  if (score === null || score === undefined) return "–";
  if (score === 0.5) return "½";
  return String(score);
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function formatMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

/* ------------------------------------------------------------------ */
/* Knockout                                                            */
/* ------------------------------------------------------------------ */

export function knockoutRounds(t: Tournament): number {
  const size = t.knockout?.bracketSize ?? Math.max(2, 1 << Math.ceil(Math.log2(Math.max(2, t.participantIds.length))));
  return Math.round(Math.log2(size));
}

export function knockoutRoundName(round: number, totalRounds: number): string {
  const left = totalRounds - round; // rounds remaining after this one
  if (left === 0) return "Final";
  if (left === 1) return "Semifinals";
  if (left === 2) return "Quarterfinals";
  return `Round of ${2 ** (left + 1)}`;
}

export interface MatchState {
  scoreA: number;
  scoreB: number;
  played: number;
  pending: number;
  decided: boolean;
  winnerId: string | null;
  walkover: boolean;
}

export function matchState(db: Database, m: { a: string | null; b: string | null; gameIds: string[]; winnerId: string | null }): MatchState {
  const games = new Map(db.games.map((g) => [g.id, g]));
  let scoreA = 0;
  let scoreB = 0;
  let played = 0;
  let pending = 0;
  for (const id of m.gameIds) {
    const g = games.get(id);
    if (!g) continue;
    if (!g.result) {
      pending++;
      continue;
    }
    played++;
    const sw = scoreFor(g.result, "white");
    if (g.whiteId === m.a) {
      scoreA += sw;
      scoreB += 1 - sw;
    } else {
      scoreB += sw;
      scoreA += 1 - sw;
    }
  }
  const walkover = (!!m.a && !m.b) || (!m.a && !!m.b);
  const decided = m.winnerId !== null;
  return { scoreA, scoreB, played, pending, decided, winnerId: m.winnerId, walkover };
}

export interface KnockoutPlacement {
  playerId: string;
  place: number;
  label: string;
  wins: number;
  losses: number;
}

/** Final (or provisional) placement: champion, runner-up, then by the round a player was knocked out. */
export function knockoutPlacement(db: Database, t: Tournament): KnockoutPlacement[] {
  const ko = t.knockout;
  if (!ko) return [];
  const total = knockoutRounds(t);
  const players = playerMap(db);
  const reached = new Map<string, number>(); // deepest round reached
  const lostIn = new Map<string, number>();
  const wins = new Map<string, number>();
  let champion: string | null = null;
  let runnerUp: string | null = null;
  let third: string | null = null;
  let fourth: string | null = null;
  for (const id of t.participantIds) reached.set(id, 1);
  for (const m of ko.matches) {
    for (const id of [m.a, m.b]) if (id) reached.set(id, Math.max(reached.get(id) ?? 0, m.round));
    if (!m.winnerId) continue;
    const loser = m.winnerId === m.a ? m.b : m.a;
    if (m.a && m.b) wins.set(m.winnerId, (wins.get(m.winnerId) ?? 0) + 1);
    if (m.thirdPlace) {
      third = m.winnerId;
      fourth = loser;
      continue;
    }
    if (loser) lostIn.set(loser, m.round);
    if (m.round === total) {
      champion = m.winnerId;
      runnerUp = loser;
    }
  }
  const rows: KnockoutPlacement[] = [];
  const placed = new Set<string>();
  const push = (id: string | null, place: number, label: string) => {
    if (!id || placed.has(id)) return;
    placed.add(id);
    rows.push({ playerId: id, place, label, wins: wins.get(id) ?? 0, losses: lostIn.has(id) ? 1 : 0 });
  };
  push(champion, 1, "Champion");
  push(runnerUp, 2, "Runner-up");
  push(third, 3, "3rd place");
  push(fourth, 4, "4th place");
  // Remaining players grouped by the round they were knocked out of, deepest first.
  const rest = t.participantIds.filter((id) => !placed.has(id));
  rest.sort((x, y) => (reached.get(y) ?? 0) - (reached.get(x) ?? 0) || (players.get(y)?.rating ?? 0) - (players.get(x)?.rating ?? 0));
  let place = rows.length + 1;
  let lastRound = -1;
  let groupStart = place;
  const inThirdPlace = new Set<string>();
  for (const m of ko.matches) if (m.thirdPlace && !m.winnerId) for (const id of [m.a, m.b]) if (id) inThirdPlace.add(id);
  rest.sort((x, y) => Number(inThirdPlace.has(y)) - Number(inThirdPlace.has(x)) || (reached.get(y) ?? 0) - (reached.get(x) ?? 0) || (players.get(y)?.rating ?? 0) - (players.get(x)?.rating ?? 0));
  for (const id of rest) {
    const knockedOut = lostIn.has(id);
    const r = lostIn.get(id) ?? reached.get(id) ?? 1;
    if (r !== lastRound) {
      groupStart = place;
      lastRound = r;
    }
    const label = inThirdPlace.has(id)
      ? "Playing for 3rd place"
      : knockedOut
        ? `Lost in ${knockoutRoundName(r, total).toLowerCase()}`
        : t.status === "finished"
          ? "Withdrawn"
          : `In ${knockoutRoundName(r, total).toLowerCase()}`;
    rows.push({ playerId: id, place: groupStart, label, wins: wins.get(id) ?? 0, losses: knockedOut ? 1 : 0 });
    place++;
  }
  return rows;
}
