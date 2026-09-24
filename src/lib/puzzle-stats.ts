/**
 * Daily-puzzle bookkeeping for claimed players: checking a reported solution against today's puzzle, and the numbers
 * built from `db.puzzleSolves`. Pure, so the actions, the Admin card and the Hall of Fame share it and tests stay plain.
 */
import type { Puzzle } from "./puzzles";
import type { Database, PuzzleSolve } from "./types";

/**
 * Whether `moves` (the solver's own moves, in order) are the puzzle's solution: every solver move of the line, and for
 * a mate the last one may be any mating alternative. The server checks this, so a "solved" can't be made up by hand.
 */
export function isSolution(p: Pick<Puzzle, "moves" | "alt">, moves: readonly string[]): boolean {
  const mine = p.moves.filter((_, i) => i % 2 === 0);
  if (moves.length !== mine.length) return false;
  return mine.every((m, i) => moves[i] === m || (i === mine.length - 1 && !!p.alt?.includes(moves[i])));
}

/** The day before a YYYY-MM-DD, as YYYY-MM-DD (calendar arithmetic in UTC, no time zone involved). */
export function dayBefore(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

export interface PuzzlePlayerStats {
  playerId: string;
  /** Days solved (a hint allowed), days given up. */
  solved: number;
  shown: number;
  hints: number;
  /** Solved in one go: no wrong move, no hint. */
  clean: number;
  /** Average wrong moves over solved days. */
  avgMisses: number;
  /** Days in a row solved, ending today or yesterday (today may still be open); 0 once a day is missed. */
  streak: number;
  best: number;
  last: string | null;
}

/** Everyone who ever touched the puzzle, most solved days first. `today` anchors the current streak. */
export function puzzleStats(db: Pick<Database, "puzzleSolves">, today: string): PuzzlePlayerStats[] {
  const byPlayer = new Map<string, PuzzleSolve[]>();
  for (const s of db.puzzleSolves) byPlayer.set(s.playerId, [...(byPlayer.get(s.playerId) ?? []), s]);
  const out: PuzzlePlayerStats[] = [];
  for (const [playerId, list] of byPlayer) {
    const solvedDays = new Set(list.filter((s) => s.result === "solved").map((s) => s.day));
    const solvedList = list.filter((s) => s.result === "solved");
    // Current streak: start today if solved, else yesterday (today is still open), then walk back.
    let streak = 0;
    let cursor = solvedDays.has(today) ? today : dayBefore(today);
    while (solvedDays.has(cursor)) {
      streak++;
      cursor = dayBefore(cursor);
    }
    let best = 0;
    for (const day of solvedDays) {
      if (solvedDays.has(dayBefore(day))) continue; // not the start of a run
      let run = 0;
      let d = day;
      while (solvedDays.has(d)) {
        run++;
        const [y, m, dd] = d.split("-").map(Number);
        d = new Date(Date.UTC(y, m - 1, dd + 1)).toISOString().slice(0, 10);
      }
      best = Math.max(best, run);
    }
    out.push({
      playerId,
      solved: solvedDays.size,
      shown: list.filter((s) => s.result === "shown").length,
      hints: list.filter((s) => s.hint).length,
      clean: solvedList.filter((s) => s.misses === 0 && !s.hint).length,
      avgMisses: solvedList.length ? Math.round((solvedList.reduce((n, s) => n + s.misses, 0) / solvedList.length) * 10) / 10 : 0,
      streak,
      best,
      last: list.map((s) => s.day).sort().at(-1) ?? null,
    });
  }
  return out.sort((a, b) => b.solved - a.solved || b.streak - a.streak || a.playerId.localeCompare(b.playerId));
}

/** Today's outcomes, first finisher first. */
export function puzzleDay(db: Pick<Database, "puzzleSolves">, day: string): PuzzleSolve[] {
  return db.puzzleSolves.filter((s) => s.day === day).sort((a, b) => a.at.localeCompare(b.at));
}
