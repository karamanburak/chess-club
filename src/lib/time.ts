/**
 * Club time. The server (Vercel) runs in UTC, the club lives in Berlin, so every "which day is it", "what time did
 * that happen" and "18:00 on that date" must go through an explicit IANA time zone instead of the server's local
 * clock. `CLUB_TIME_ZONE` in the environment overrides the default for a club elsewhere.
 */

const DEFAULT_TIME_ZONE = "Europe/Berlin";

/** The club's IANA time zone, e.g. "Europe/Berlin". */
export function clubTimeZone(env: Record<string, string | undefined> = process.env): string {
  const tz = env.CLUB_TIME_ZONE?.trim() ?? "";
  if (tz === "") return DEFAULT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

interface Parts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

const partFormatters = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = partFormatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    partFormatters.set(tz, f);
  }
  return f;
}

/** Wall-clock components of an instant in the given zone. */
export function zoneParts(d: Date, tz = clubTimeZone()): Parts {
  const p: Record<string, number> = {};
  for (const { type, value } of formatter(tz).formatToParts(d)) if (type !== "literal") p[type] = Number(value);
  return { year: p.year, month: p.month, day: p.day, hour: p.hour === 24 ? 0 : p.hour, minute: p.minute };
}

const two = (n: number) => String(n).padStart(2, "0");

/** "YYYY-MM-DD" of an instant in club time. Defaults to now. */
export function localDay(d: Date = new Date(), tz = clubTimeZone()): string {
  const p = zoneParts(d, tz);
  return `${p.year}-${two(p.month)}-${two(p.day)}`;
}

/** "YYYY-MM" of an instant in club time. */
export function localMonth(d: Date, tz = clubTimeZone()): string {
  return localDay(d, tz).slice(0, 7);
}

/** "HH:MM" of an instant in club time. */
export function localTime(d: Date, tz = clubTimeZone()): string {
  const p = zoneParts(d, tz);
  return `${two(p.hour)}:${two(p.minute)}`;
}

/** "YYYY-MM-DD HH:MM" in club time, for activity-log lines and notifications. */
export function localStamp(iso: string, tz = clubTimeZone()): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : `${localDay(d, tz)} ${localTime(d, tz)}`;
}

/**
 * The club day a stored value falls on. A plain "YYYY-MM-DD" (tournament date, season bound) is already a day and
 * stays as it is; an ISO instant is converted. Anything unparsable comes back unchanged.
 */
export function dayOf(value: string, tz = clubTimeZone()): string {
  if (DAY_RE.test(value)) return value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : localDay(d, tz);
}

/** Whether the instant falls on the same club day as `now`. */
export function sameLocalDay(iso: string, now: Date = new Date(), tz = clubTimeZone()): boolean {
  const d = new Date(iso);
  return !Number.isNaN(d.getTime()) && localDay(d, tz) === localDay(now, tz);
}

/**
 * The instant at which the club's clocks show `date` `time` ("YYYY-MM-DD", "HH:MM"), as an ISO string; null for
 * malformed input. Handles the zone's offset on that very day, so 18:00 in July is 16:00Z and 17:00Z in January.
 * A wall time skipped by a DST jump resolves to the instant an hour later, as clocks do.
 */
export function zonedToUtc(date: string, time: string, tz = clubTimeZone()): string | null {
  if (!DAY_RE.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const wanted = Date.UTC(y, mo - 1, d, h, mi);
  if (Number.isNaN(wanted)) return null;
  // First guess: treat the wall time as UTC, read what the zone shows then, correct by the difference; repeat once
  // in case the correction crossed a DST boundary.
  let guess = wanted;
  for (let i = 0; i < 2; i++) {
    const p = zoneParts(new Date(guess), tz);
    const shown = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    guess += wanted - shown;
  }
  const result = new Date(guess);
  return Number.isNaN(result.getTime()) ? null : result.toISOString();
}

/** Whole days from today (club time) to a "YYYY-MM-DD"; negative when past, null when malformed. */
export function daysFromToday(day: string, now: Date = new Date(), tz = clubTimeZone()): number | null {
  if (!DAY_RE.test(day)) return null;
  const [y, m, d] = day.split("-").map(Number);
  const [ty, tm, td] = localDay(now, tz).split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 86400_000);
}
