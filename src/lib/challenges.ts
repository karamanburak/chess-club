/**
 * Challenges: two members agree on a game. Pure helpers over `db.challenges`; the actions in
 * actions.ts do the writes. A challenge that was never answered, or accepted but never recorded,
 * counts as expired a day after its proposed time, so nothing lingers.
 */
import type { Challenge, ChallengeSession, ChallengeStatus, Database, Game } from "./types";
import { scoreFor } from "./elo";
import { pickable, type PickablePlayer } from "./pick";
import { sameLocalDay, zonedToUtc } from "./time";

export const EXPIRE_AFTER_MS = 24 * 60 * 60_000;
export const OPEN: readonly ChallengeStatus[] = ["pending", "accepted"];

export function isOpen(c: Challenge): boolean {
  return OPEN.includes(c.status);
}

/** The status as it should be shown now: open challenges past their time plus a day read as expired. */
export function effectiveStatus(c: Challenge, now = Date.now()): ChallengeStatus {
  if (isOpen(c) && new Date(c.at).getTime() + EXPIRE_AFTER_MS < now) return "expired";
  return c.status;
}

/**
 * Whether the result may still be entered: agreed and not yet recorded. An agreed game that slipped past its day
 * expires like any other, but keeps its drawn colours (`whiteId`, set only at acceptance), so it stays recordable:
 * the two may simply have forgotten to enter it.
 */
export function recordable(c: Challenge): boolean {
  return c.status === "accepted" || (c.status === "expired" && !!c.whiteId);
}

/** Lengths a session can be booked for, in minutes. */
export const SESSION_MINUTES = [30, 60, 90, 120, 180] as const;
export const SESSION_SCORING: readonly ChallengeSession["scoring"][] = ["each", "single"];

/** A session from the form fields, or null for a single game; throws nothing, the caller reports a bad value. */
export function parseSession(kind: string, minutes: string, scoring: string): ChallengeSession | null | "invalid" {
  if (kind !== "session") return null;
  const n = Number(minutes);
  if (!(SESSION_MINUTES as readonly number[]).includes(n) || !SESSION_SCORING.includes(scoring as ChallengeSession["scoring"])) return "invalid";
  return { minutes: n, scoring: scoring as ChallengeSession["scoring"] };
}

/** A session whose games are entered one by one (see ChallengeSession). */
export function gameBySession(c: Challenge): boolean {
  return c.session?.scoring === "each";
}

/** Every game recorded for this challenge: the one game, or the games of an `each` session in order. */
export function challengeGameIds(c: Challenge): string[] {
  return c.gameIds?.length ? c.gameIds : c.gameId ? [c.gameId] : [];
}

/** Colours of the next game in an `each` session: the drawn colours first, then they swap game by game. */
export function nextSessionColors(c: Challenge): { whiteId: string; blackId: string } {
  const first = c.whiteId ?? c.fromId;
  const second = first === c.fromId ? c.toId : c.fromId;
  return (c.gameIds?.length ?? 0) % 2 === 0 ? { whiteId: first, blackId: second } : { whiteId: second, blackId: first };
}

/** Points of both players over the recorded games of a challenge (a session, or the one game). */
export function sessionScore(c: Challenge, games: Map<string, Pick<Game, "whiteId" | "result">>): { from: number; to: number; games: number } {
  let from = 0;
  let to = 0;
  let n = 0;
  for (const id of challengeGameIds(c)) {
    const g = games.get(id);
    if (!g?.result) continue;
    n++;
    const color = g.whiteId === c.fromId ? "white" : "black";
    const s = scoreFor(g.result, color);
    from += s;
    to += 1 - s;
  }
  return { from, to, games: n };
}

/**
 * Drops challenges that point at things no longer there: a player who was deleted (either side), or a played game
 * that was removed by a reset. Call inside mutate() after removing players or games. Returns how many went.
 */
export function pruneChallenges(db: Database): number {
  const players = new Set(db.players.map((p) => p.id));
  const games = new Set(db.games.map((g) => g.id));
  const before = db.challenges.length;
  for (const c of db.challenges) if (c.gameIds) c.gameIds = c.gameIds.filter((id) => games.has(id));
  db.challenges = db.challenges.filter(
    (c) => players.has(c.fromId) && players.has(c.toId) && c.fromId !== c.toId && !(c.gameId && !games.has(c.gameId)) && !(c.status === "played" && gameBySession(c) && !c.gameIds?.length),
  );
  return before - db.challenges.length;
}

/** Writes the expiry into the data. Call inside mutate() before touching challenges. Returns how many changed. */
export function expireChallenges(db: Database, now = Date.now()): number {
  let n = 0;
  for (const c of db.challenges) {
    if (isOpen(c) && effectiveStatus(c, now) === "expired") {
      c.status = "expired";
      c.updatedAt = new Date(now).toISOString();
      n++;
    }
  }
  return n;
}

/** Draws colours for an agreed game: a coin flip, so neither side picks. `rng` is injectable for tests. */
export function drawColors(c: Challenge, rng: () => number = Math.random): { whiteId: string; blackId: string } {
  const whiteFirst = rng() < 0.5;
  return whiteFirst ? { whiteId: c.fromId, blackId: c.toId } : { whiteId: c.toId, blackId: c.fromId };
}

export function involves(c: Challenge, playerId: string): boolean {
  return c.fromId === playerId || c.toId === playerId;
}

export function opponentOf(c: Challenge, playerId: string): string {
  return c.fromId === playerId ? c.toId : c.fromId;
}

/** True when this player is the one who has to answer the current proposal. */
export function awaitsAnswerFrom(c: Challenge, playerId: string, now = Date.now()): boolean {
  return effectiveStatus(c, now) === "pending" && involves(c, playerId) && c.proposedBy !== playerId;
}

/** Challenges waiting for this player's answer; the header badge counts them. */
export function pendingFor(db: Database, playerId: string, now = Date.now()): Challenge[] {
  return db.challenges.filter((c) => awaitsAnswerFrom(c, playerId, now)).sort(byTime);
}

/** Proposals this player sent that the other side has not answered yet. */
export function sentBy(db: Database, playerId: string, now = Date.now()): Challenge[] {
  return db.challenges.filter((c) => effectiveStatus(c, now) === "pending" && involves(c, playerId) && c.proposedBy === playerId).sort(byTime);
}

/** Accepted games still to be played, soonest first. `playerId` narrows to one person. */
export function upcoming(db: Database, playerId?: string, now = Date.now()): Challenge[] {
  return db.challenges.filter((c) => effectiveStatus(c, now) === "accepted" && (!playerId || involves(c, playerId))).sort(byTime);
}

/** Everything that is settled (played, declined, cancelled, expired), newest first. */
export function history(db: Database, playerId: string, now = Date.now()): Challenge[] {
  return db.challenges.filter((c) => involves(c, playerId) && !OPEN.includes(effectiveStatus(c, now))).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Admin overview filter on /challenges: one status group, or everything. */
export const CLUB_FILTERS = ["all", "pending", "accepted", "played", "settled"] as const;
export type ClubFilter = (typeof CLUB_FILTERS)[number];

export function isClubFilter(v: unknown): v is ClubFilter {
  return typeof v === "string" && (CLUB_FILTERS as readonly string[]).includes(v);
}

/** Which filter group a challenge falls in: "settled" is everything that came to nothing (declined, withdrawn, expired). */
export function clubGroup(c: Challenge, now = Date.now()): Exclude<ClubFilter, "all"> {
  const s = effectiveStatus(c, now);
  return s === "pending" || s === "accepted" || s === "played" ? s : "settled";
}

/**
 * Every challenge of the club for the admin's overview, optionally one group and one player: open ones by date
 * (soonest first), settled ones newest first.
 */
export function clubChallenges(db: Database, filter: { status?: ClubFilter; playerId?: string | null } = {}, now = Date.now()): Challenge[] {
  const status = filter.status ?? "all";
  return db.challenges
    .filter((c) => (status === "all" || clubGroup(c, now) === status) && (!filter.playerId || involves(c, filter.playerId)))
    .sort((a, b) => {
      const openA = OPEN.includes(effectiveStatus(a, now));
      const openB = OPEN.includes(effectiveStatus(b, now));
      if (openA !== openB) return openA ? -1 : 1;
      return openA ? byTime(a, b) : b.updatedAt.localeCompare(a.updatedAt);
    });
}

/** Statuses whose card can shrink to one line: nothing happened, nothing to show. */
export const SETTLED_QUIET: readonly ChallengeStatus[] = ["declined", "cancelled", "expired"];

export interface PlayedSummary {
  /** From the viewer's seat; null when the viewer did not play. */
  outcome: "won" | "lost" | "draw" | null;
  /** The viewer's rating change, when the game was rated and replayed. */
  delta: number | null;
}

/** What the recorded game means for `me`: won / lost / draw and the rating points it moved. */
export function playedSummary(g: Pick<Game, "whiteId" | "blackId" | "result" | "rated" | "whiteRatingBefore" | "whiteRatingAfter" | "blackRatingBefore" | "blackRatingAfter">, me: string | null): PlayedSummary {
  const color = me === g.whiteId ? "white" : me === g.blackId ? "black" : null;
  if (!color || !g.result) return { outcome: null, delta: null };
  const score = scoreFor(g.result, color);
  const before = color === "white" ? g.whiteRatingBefore : g.blackRatingBefore;
  const after = color === "white" ? g.whiteRatingAfter : g.blackRatingAfter;
  return {
    outcome: score === 1 ? "won" : score === 0 ? "lost" : "draw",
    delta: g.rated && before !== null && after !== null ? after - before : null,
  };
}

/** Every open (pending or agreed) challenge between these two, soonest first. Two players may arrange several games. */
export function openBetween(db: Database, a: string, b: string, now = Date.now()): Challenge[] {
  return db.challenges.filter((c) => OPEN.includes(effectiveStatus(c, now)) && involves(c, a) && involves(c, b)).sort(byTime);
}

/** How many open challenges two players may have at once: enough for a series, not a flood. */
export const MAX_OPEN_PER_PAIR = 5;

export type ChallengeProblem = "self" | "notFound" | "inactive" | "past" | "exists" | "tooMany";

/** What the challenge form (a client component) gets per player: see PickablePlayer, never the whole record. */
export type ChallengeOpponent = PickablePlayer;

export function challengeOpponents(db: Database): ChallengeOpponent[] {
  return db.players.filter((p) => p.active).map((p) => pickable(p));
}

/** "15+10", "5+3" or plain "10": minutes, optionally +increment. Nothing else. */
export const TIME_CONTROL_RE = /^\d+(\+\d+)?$/;

/** What the time-control field keeps while typing: digits and one "+", and the "+" only after a digit. */
export function cleanTimeControl(raw: string): string {
  let out = "";
  for (const ch of raw) {
    if (/\d/.test(ch)) out += ch;
    else if (ch === "+" && out.length > 0 && !out.includes("+")) out += ch;
  }
  return out.slice(0, 20);
}

/** A challenge may be a little in the past: "right now" is stamped before the check runs, and clocks differ. */
export const PAST_GRACE_MS = 15 * 60_000;

export function challengeCheck(db: Database, fromId: string, toId: string, at: string, now = Date.now()): ChallengeProblem | null {
  if (fromId === toId) return "self";
  const from = db.players.find((p) => p.id === fromId);
  const to = db.players.find((p) => p.id === toId);
  if (!from || !to) return "notFound";
  if (!to.active) return "inactive";
  const when = new Date(at).getTime();
  if (!Number.isFinite(when) || when < now - PAST_GRACE_MS) return "past";
  const open = openBetween(db, fromId, toId, now);
  // Back-to-back games are fine; the very same minute twice is a double send.
  if (open.some((c) => Math.floor(new Date(c.at).getTime() / 60_000) === Math.floor(when / 60_000))) return "exists";
  if (open.length >= MAX_OPEN_PER_PAIR) return "tooMany";
  return null;
}

/** "2026-09-20" + "18:30" from the form → ISO in the server's local time; null when unparsable. */
export function combineDateTime(date: string, time: string): string | null {
  return zonedToUtc(date, time);
}

/** Same calendar day as `now`, in club time. */
export function isToday(iso: string, now = new Date()): boolean {
  return sameLocalDay(iso, now);
}

function byTime(a: Challenge, b: Challenge): number {
  return a.at.localeCompare(b.at);
}

/** Words the calendar entry needs; English defaults keep the tests plain. */
export const DEFAULT_CALENDAR_MSGS = { title: "♟ Board Time", hasWhite: "{name} has white", timeControl: "Time control {tc}" };
export type CalendarMsgs = typeof DEFAULT_CALENDAR_MSGS;

/** Calendar slot when no time control is given. */
export const DEFAULT_DURATION_MINUTES = 30;

/**
 * How long to block in the calendar for a time control such as "15+10", "5+3", "90" or "90 min":
 * both clocks run down, and a game lasts about 40 moves, so 2 × (base + 40 × increment), rounded up
 * to the next quarter hour and never under 30 minutes. Unparsable input falls back to the default.
 */
export function estimateDurationMinutes(timeControl: string): number {
  const m = /^\s*(\d+(?:[.,]\d+)?)\s*(?:\+\s*(\d+))?/.exec(timeControl ?? "");
  if (!m) return DEFAULT_DURATION_MINUTES;
  const base = parseFloat(m[1].replace(",", "."));
  const increment = m[2] ? parseInt(m[2], 10) : 0;
  if (!Number.isFinite(base) || base <= 0) return DEFAULT_DURATION_MINUTES;
  const perPlayer = base + (40 * increment) / 60;
  const total = Math.ceil((perPlayer * 2) / 15) * 15;
  return Math.max(DEFAULT_DURATION_MINUTES, total);
}

export interface CalendarEvent {
  title: string;
  description: string;
  location: string;
  start: Date;
  end: Date;
}

/**
 * The calendar entry for one agreed game, the same for both players and every calendar app:
 * "♟ Board Time · <club>", with the pairing, colours, time control and note in the description.
 */
export function calendarEvent(c: Challenge, names: { from: string; to: string; club: string }, m: CalendarMsgs = DEFAULT_CALENDAR_MSGS, durationMinutes = c.session?.minutes ?? estimateDurationMinutes(c.timeControl)): CalendarEvent {
  const start = new Date(c.at);
  const whiteName = c.whiteId ? (c.whiteId === c.fromId ? names.from : names.to) : null;
  const lines = [
    `${names.from} – ${names.to}`,
    whiteName ? m.hasWhite.replace("{name}", whiteName) : null,
    c.timeControl && !c.session ? m.timeControl.replace("{tc}", c.timeControl) : null,
    c.note || null,
  ];
  return {
    title: `${m.title} · ${names.club}`,
    description: lines.filter((l): l is string => !!l).join("\n"),
    location: c.place,
    start,
    end: new Date(start.getTime() + durationMinutes * 60_000),
  };
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");

/** A minimal iCalendar file for one accepted game, so a phone calendar can remind both players. */
export function toIcs(c: Challenge, names: { from: string; to: string; club: string }, m: CalendarMsgs = DEFAULT_CALENDAR_MSGS): string {
  const ev = calendarEvent(c, names, m);
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//chess-club//challenge//EN",
    "BEGIN:VEVENT",
    `UID:challenge-${c.id}@chess-club`,
    `DTSTAMP:${stamp(new Date(c.updatedAt))}`,
    `DTSTART:${stamp(ev.start)}`,
    `DTEND:${stamp(ev.end)}`,
    `SUMMARY:${esc(ev.title)}`,
    ev.location ? `LOCATION:${esc(ev.location)}` : null,
    ev.description ? `DESCRIPTION:${esc(ev.description)}` : null,
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter((l): l is string => l !== null)
    .join("\r\n");
}

/** Google Calendar "add event" link for one agreed game; opens prefilled, the user saves it themselves. */
export function googleCalendarUrl(c: Challenge, names: { from: string; to: string; club: string }, m: CalendarMsgs = DEFAULT_CALENDAR_MSGS): string {
  const ev = calendarEvent(c, names, m);
  const q = new URLSearchParams({ action: "TEMPLATE", text: ev.title, dates: `${stamp(ev.start)}/${stamp(ev.end)}`, details: ev.description });
  if (ev.location) q.set("location", ev.location);
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}
