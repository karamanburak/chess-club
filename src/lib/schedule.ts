import { DEFAULT_CALENDAR_MSGS, estimateDurationMinutes, type CalendarEvent, type CalendarMsgs } from "./challenges";
import { daysFromToday, zonedToUtc } from "./time";
import type { Database, Game, Round, Tournament } from "./types";

/**
 * Tournaments whose rounds spread over weeks: the organiser gives a round a "play by" day (`Round.deadline`) and the
 * two players of a board note when and where they meet (`Game.scheduledAt` / `Game.place`). Everything here is
 * read-only; the actions `setRoundDeadline` and `setGameSchedule` write.
 */

/** An agreed slot stays listed this long after it passed, so a game that ran late or still lacks its result does not vanish. */
export const SCHEDULE_KEEP_MS = 24 * 60 * 60_000;

/** Longest place text a game stores (same as a challenge). */
export const PLACE_MAX = 80;

/** A real "YYYY-MM-DD" day, or null. */
export function cleanDay(value: string): string | null {
  return zonedToUtc(value, "12:00") && daysFromToday(value) !== null ? value : null;
}

/** The tournament a game's time may be set in: a real board (no forfeit entry) without a result, in a tournament that still runs. */
export function schedulableIn(db: Database, g: Game): Tournament | null {
  if (!g.tournamentId || g.result || !g.board) return null;
  const t = db.tournaments.find((x) => x.id === g.tournamentId);
  return t && t.status !== "finished" ? t : null;
}

export interface ScheduledGame {
  game: Game;
  tournament: Tournament;
  at: string;
  place: string;
}

/** Unplayed tournament games with an agreed time, soonest first; of one player when `playerId` is given. */
export function scheduledGames(db: Database, playerId?: string, now = Date.now()): ScheduledGame[] {
  const out: ScheduledGame[] = [];
  for (const g of db.games) {
    if (!g.scheduledAt) continue;
    if (playerId && g.whiteId !== playerId && g.blackId !== playerId) continue;
    const at = new Date(g.scheduledAt).getTime();
    if (Number.isNaN(at) || at < now - SCHEDULE_KEEP_MS) continue;
    const tournament = schedulableIn(db, g);
    if (tournament) out.push({ game: g, tournament, at: g.scheduledAt, place: g.place ?? "" });
  }
  return out.sort((a, b) => a.at.localeCompare(b.at) || a.game.seq - b.game.seq);
}

export type DeadlineState = "open" | "soon" | "today" | "overdue";

/** How a round's "play by" day stands today (club time); null without a valid deadline. "soon" = three days or less. */
export function deadlineState(round: Pick<Round, "deadline">, now: Date = new Date()): { state: DeadlineState; days: number } | null {
  if (!round.deadline) return null;
  const days = daysFromToday(round.deadline, now);
  if (days === null) return null;
  return { state: days < 0 ? "overdue" : days === 0 ? "today" : days <= 3 ? "soon" : "open", days };
}

/** Moves agreed times from a round's old games to the new ones of the same two players (colours may differ). */
export function carrySchedules(oldGames: Game[], newGames: Game[]): void {
  const key = (g: Game) => [g.whiteId, g.blackId].sort().join("|");
  const kept = new Map(oldGames.filter((g) => g.scheduledAt).map((g) => [key(g), g]));
  for (const g of newGames) {
    const old = kept.get(key(g));
    if (!old) continue;
    g.scheduledAt = old.scheduledAt;
    if (old.place) g.place = old.place;
  }
}

/**
 * The calendar entry for a scheduled tournament game, built like the one for a challenge. `where` is the line that
 * says which game it is ("Winter Open · Round 3").
 */
export function gameCalendarEvent(
  g: Pick<Game, "scheduledAt" | "place">,
  facts: { white: string; black: string; club: string; where: string; timeControl: string },
  m: CalendarMsgs = DEFAULT_CALENDAR_MSGS,
): CalendarEvent | null {
  if (!g.scheduledAt) return null;
  const start = new Date(g.scheduledAt);
  if (Number.isNaN(start.getTime())) return null;
  const lines = [
    `${facts.white} – ${facts.black}`,
    facts.where,
    m.hasWhite.replace("{name}", facts.white),
    facts.timeControl ? m.timeControl.replace("{tc}", facts.timeControl) : null,
  ];
  return {
    title: `${m.title} · ${facts.club}`,
    description: lines.filter((l): l is string => !!l).join("\n"),
    location: g.place ?? "",
    start,
    end: new Date(start.getTime() + estimateDurationMinutes(facts.timeControl) * 60_000),
  };
}
