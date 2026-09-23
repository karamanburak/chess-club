import { fmt, plural, type Dict } from "./i18n";
import type { IconName } from "@/components/icons";
import { dayOf, daysFromToday, localDay } from "./time";
/**
 * The "club life" layer: titles by rating band, achievements, seasons with
 * their own table and champion, tournament winners and home-page highlights.
 * Everything here is derived from games and sessions; nothing is stored
 * except the season records themselves.
 */
import type { Database, Game, Player, Season, Tournament } from "./types";
import { countsForRating } from "./elo";
import { knockoutPlacement, monthsWithGames, monthTable, playerScore, standings, streaks } from "./queries";

/* ------------------------------------------------------------------ */
/* Titles                                                              */
/* ------------------------------------------------------------------ */

export interface Title {
  key: string;
  label: string;
  short: string;
  min: number;
  icon: string;
}

/** Club titles are held from TITLE_GAMES games onwards and follow the current rating. */
export const TITLE_GAMES = 10;

export const TITLES: readonly Title[] = [
  { key: "novice", label: "Novice", short: "N", min: 0, icon: "♙" },
  { key: "club", label: "Club Player", short: "CP", min: 1100, icon: "♘" },
  { key: "expert", label: "Club Expert", short: "CE", min: 1300, icon: "♗" },
  { key: "master", label: "Club Master", short: "CM", min: 1500, icon: "♖" },
  { key: "grandmaster", label: "Club Grandmaster", short: "CGM", min: 1700, icon: "♕" },
];

export function titleFor(p: { rating: number; gamesPlayed: number }): Title | null {
  if (p.gamesPlayed < TITLE_GAMES) return null;
  let best: Title | null = null;
  for (const t of TITLES) if (p.rating >= t.min) best = t;
  return best;
}

/** The next title a player can reach and how many points are missing, or null at the top. */
export function nextTitle(p: { rating: number; gamesPlayed: number }): { title: Title; missing: number; games: number } | null {
  const current = titleFor(p);
  const idx = current ? TITLES.findIndex((t) => t.key === current.key) : -1;
  const games = Math.max(0, TITLE_GAMES - p.gamesPlayed);
  if (!current) {
    const would = TITLES.filter((t) => p.rating >= t.min).at(-1) ?? TITLES[0];
    return { title: would, missing: 0, games };
  }
  const next = TITLES[idx + 1];
  return next ? { title: next, missing: next.min - p.rating, games: 0 } : null;
}

/* ------------------------------------------------------------------ */
/* Achievements                                                        */
/* ------------------------------------------------------------------ */

export interface AchievementDef {
  key: string;
  label: string;
  description: string;
  icon: string;
}

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  { key: "first-win", label: "First Blood", description: "Won a game.", icon: "🩸" },
  { key: "games-10", label: "Regular", description: "Played 10 games.", icon: "🎟️" },
  { key: "games-50", label: "Veteran", description: "Played 50 games.", icon: "🎖️" },
  { key: "games-100", label: "Centurion", description: "Played 100 games.", icon: "💯" },
  { key: "streak-3", label: "Hat-trick", description: "Three wins in a row.", icon: "🎩" },
  { key: "streak-5", label: "On Fire", description: "Five wins in a row.", icon: "🔥" },
  { key: "giant-slayer", label: "Giant Slayer", description: "Beat someone rated 200+ points higher.", icon: "🗡️" },
  { key: "comeback", label: "Comeback", description: "Won right after three straight losses.", icon: "🦅" },
  { key: "draw-artist", label: "Draw Artist", description: "Ten draws. Peace was always an option.", icon: "🕊️" },
  { key: "perfect-night", label: "Perfect Night", description: "Won every board of a club night with at least three games.", icon: "🌙" },
  { key: "night-owl", label: "Night Owl", description: "Played five or more games in one club night.", icon: "🦉" },
  { key: "regular-face", label: "Familiar Face", description: "Showed up to ten club nights.", icon: "☕" },
  { key: "climber", label: "Climber", description: "Gained 100 rating points since joining.", icon: "🧗" },
  { key: "tournament-winner", label: "Tournament Winner", description: "Finished first in a tournament.", icon: "🏆" },
  { key: "season-champion", label: "Season Champion", description: "Topped the table of a whole season.", icon: "👑" },
];

export interface Achievement extends AchievementDef {
  /** ISO timestamp of the game or event that earned it, or null when not yet earned. */
  earnedAt: string | null;
}

function chronological(db: Database, playerId: string): (Game & { completedAt: string })[] {
  return db.games
    .filter((g): g is Game & { completedAt: string } => g.completedAt !== null && g.result !== null && (g.whiteId === playerId || g.blackId === playerId))
    .sort((a, b) => a.completedAt.localeCompare(b.completedAt) || a.seq - b.seq);
}

export function achievements(db: Database, playerId: string): Achievement[] {
  const earned = new Map<string, string>();
  const mark = (key: string, at: string) => {
    if (!earned.has(key)) earned.set(key, at);
  };
  const games = chronological(db, playerId).filter(countsForRating);

  let played = 0;
  let draws = 0;
  let winRun = 0;
  let lossRun = 0;
  for (const g of games) {
    const s = playerScore(g, playerId)!;
    played++;
    if (played === 10) mark("games-10", g.completedAt);
    if (played === 50) mark("games-50", g.completedAt);
    if (played === 100) mark("games-100", g.completedAt);
    if (s === 1) {
      mark("first-win", g.completedAt);
      winRun++;
      if (lossRun >= 3) mark("comeback", g.completedAt);
      lossRun = 0;
      if (winRun === 3) mark("streak-3", g.completedAt);
      if (winRun === 5) mark("streak-5", g.completedAt);
      const mine = g.whiteId === playerId ? g.whiteRatingBefore : g.blackRatingBefore;
      const theirs = g.whiteId === playerId ? g.blackRatingBefore : g.whiteRatingBefore;
      if (mine !== null && theirs !== null && theirs - mine >= 200) mark("giant-slayer", g.completedAt);
    } else if (s === 0) {
      winRun = 0;
      lossRun++;
    } else {
      winRun = 0;
      lossRun = 0;
      draws++;
      if (draws === 10) mark("draw-artist", g.completedAt);
    }
  }

  // Club nights
  let nights = 0;
  for (const s of [...db.sessions].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    if (!s.presentIds.includes(playerId)) continue;
    nights++;
    const at = s.closedAt ?? s.createdAt;
    if (nights === 10) mark("regular-face", at);
    const mine = games.filter((g) => g.sessionId === s.id);
    if (mine.length >= 5) mark("night-owl", at);
    if (mine.length >= 3 && mine.every((g) => playerScore(g, playerId) === 1)) mark("perfect-night", at);
  }

  const player = db.players.find((p) => p.id === playerId);
  if (player && player.rating - player.initialRating >= 100) {
    // Find the first game after which the player was 100+ above the start.
    const g = games.find((x) => ((x.whiteId === playerId ? x.whiteRatingAfter : x.blackRatingAfter) ?? 0) - player.initialRating >= 100);
    mark("climber", g?.completedAt ?? new Date().toISOString());
  }

  for (const w of tournamentWinners(db)) if (w.playerId === playerId) mark("tournament-winner", `${w.tournament.date}T23:59:59.000Z`);
  for (const s of db.seasons) if (s.championId === playerId && s.end) mark("season-champion", `${s.end}T23:59:59.000Z`);

  return ACHIEVEMENTS.map((a) => ({ ...a, earnedAt: earned.get(a.key) ?? null }));
}

/* ------------------------------------------------------------------ */
/* Attendance                                                          */
/* ------------------------------------------------------------------ */

export interface Attendance {
  nights: number;
  /** Closed club nights since the player joined. */
  possible: number;
  last: string | null;
}

export function attendance(db: Database, player: Player): Attendance {
  const closed = db.sessions.filter((s) => s.closedAt !== null);
  const mine = db.sessions.filter((s) => s.presentIds.includes(player.id));
  const possible = closed.filter((s) => s.createdAt >= player.createdAt).length;
  const last = mine.map((s) => s.createdAt).sort().at(-1) ?? null;
  return { nights: mine.length, possible: Math.max(possible, mine.length), last };
}

/* ------------------------------------------------------------------ */
/* Tournament winners                                                  */
/* ------------------------------------------------------------------ */

export interface TournamentWinner {
  tournament: Tournament;
  playerId: string;
  runnerUpId: string | null;
}

export function tournamentWinner(db: Database, t: Tournament): TournamentWinner | null {
  if (t.status !== "finished" || !t.rounds.length) return null;
  if (t.pairingMode === "knockout") {
    const placed = knockoutPlacement(db, t);
    const first = placed.find((p) => p.place === 1); // label is localized, place is not
    if (!first) return null;
    return { tournament: t, playerId: first.playerId, runnerUpId: placed.find((p) => p.place === 2)?.playerId ?? null };
  }
  const table = standings(db, t);
  if (!table.length) return null;
  return { tournament: t, playerId: table[0].playerId, runnerUpId: table[1]?.playerId ?? null };
}

/** Newest first. */
export function tournamentWinners(db: Database): TournamentWinner[] {
  return db.tournaments
    .map((t) => tournamentWinner(db, t))
    .filter((w): w is TournamentWinner => w !== null)
    .sort((a, b) => b.tournament.date.localeCompare(a.tournament.date));
}

/* ------------------------------------------------------------------ */
/* Seasons                                                             */
/* ------------------------------------------------------------------ */

export function currentSeason(db: Database): Season | null {
  return db.seasons.find((s) => s.end === null) ?? null;
}

/**
 * A season that has run past the calendar year it started in (or for more than a year) is
 * probably just forgotten: the admin should close it so the champion gets crowned.
 * Returns the number of months it has been running, or null when it is fine.
 */
export function seasonOverdue(season: Season, today = localDay()): number | null {
  if (season.end) return null;
  const startYear = Number(season.start.slice(0, 4));
  const todayYear = Number(today.slice(0, 4));
  const months = (todayYear - startYear) * 12 + (Number(today.slice(5, 7)) - Number(season.start.slice(5, 7)));
  // Grace period: a season started in December may legitimately run into January.
  if (todayYear > startYear && months >= 2) return months;
  if (months >= 12) return months;
  return null;
}

export interface SeasonRow {
  playerId: string;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  ratingStart: number | null;
  ratingEnd: number | null;
  ratingChange: number;
  /** Tournaments won inside the season. */
  titles: number;
  nights: number;
}

function inSeason(at: string | null, s: Season): at is string {
  if (!at) return false;
  const day = dayOf(at);
  return day >= s.start && (s.end === null || day <= s.end);
}

/**
 * Season table: every rated-able game in the window counts one point per win,
 * half per draw. Sorted by points, then wins, then rating gained. Playing more
 * is rewarded on purpose: a season champion is someone who showed up.
 */
export function seasonTable(db: Database, season: Season): SeasonRow[] {
  const rows = new Map<string, SeasonRow>();
  const row = (id: string) => {
    let r = rows.get(id);
    if (!r) {
      r = { playerId: id, games: 0, wins: 0, draws: 0, losses: 0, points: 0, ratingStart: null, ratingEnd: null, ratingChange: 0, titles: 0, nights: 0 };
      rows.set(id, r);
    }
    return r;
  };
  const games = db.games
    .filter((g) => countsForRating(g) && inSeason(g.completedAt, season))
    .sort((a, b) => (a.completedAt ?? "").localeCompare(b.completedAt ?? "") || a.seq - b.seq);
  for (const g of games) {
    for (const id of [g.whiteId, g.blackId]) {
      const r = row(id);
      const s = playerScore(g, id)!;
      r.games++;
      r.points += s;
      if (s === 1) r.wins++;
      else if (s === 0) r.losses++;
      else r.draws++;
      const before = id === g.whiteId ? g.whiteRatingBefore : g.blackRatingBefore;
      const after = id === g.whiteId ? g.whiteRatingAfter : g.blackRatingAfter;
      if (r.ratingStart === null && before !== null) r.ratingStart = before;
      if (after !== null) r.ratingEnd = after;
    }
  }
  for (const r of rows.values()) if (r.ratingStart !== null && r.ratingEnd !== null) r.ratingChange = r.ratingEnd - r.ratingStart;
  for (const w of tournamentWinners(db)) if (inSeason(w.tournament.date, season)) row(w.playerId).titles++;
  for (const s of db.sessions) if (inSeason(s.createdAt, season)) for (const id of s.presentIds) if (rows.has(id)) row(id).nights++;
  return [...rows.values()].sort((a, b) => b.points - a.points || b.wins - a.wins || b.ratingChange - a.ratingChange);
}

/* ------------------------------------------------------------------ */
/* Monthly champions                                                   */
/* ------------------------------------------------------------------ */

export interface MonthChampion {
  month: string;
  playerId: string;
  points: number;
  games: number;
}

/** Best of each month with at least MIN games. Newest first. */
export function monthChampions(db: Database, minGames = 3): MonthChampion[] {
  const out: MonthChampion[] = [];
  for (const month of monthsWithGames(db)) {
    const top = monthTable(db, month).find((r) => r.games >= minGames);
    if (top) out.push({ month, playerId: top.playerId, points: top.points, games: top.games });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Highlights for the home page                                        */
/* ------------------------------------------------------------------ */

import { club as clubMessages } from "./i18n/messages/club";
const DEFAULT_HIGHLIGHT_MSGS = clubMessages.en.highlights;

export interface Highlight {
  key: string;
  /** Line icon name (see components/icons.tsx); no emoji in UI chrome. */
  icon: IconName;
  title: string;
  text: string;
  playerId?: string;
  gameId?: string;
}

/** What happened lately, in a handful of lines. */
export function highlights(db: Database, days = 14, m: Dict["club"]["highlights"] = DEFAULT_HIGHLIGHT_MSGS): Highlight[] {
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const recent = db.games.filter((g): g is Game & { completedAt: string } => countsForRating(g) && g.completedAt >= since);
  const name = (id: string) => db.players.find((p) => p.id === id)?.name ?? "?";
  const out: Highlight[] = [];

  let upset: { g: Game; diff: number; winner: string; loser: string } | null = null;
  const gain = new Map<string, number>();
  const count = new Map<string, number>();
  for (const g of recent) {
    const sw = playerScore(g, g.whiteId)!;
    if (sw !== 0.5 && g.whiteRatingBefore !== null && g.blackRatingBefore !== null) {
      const winner = sw === 1 ? g.whiteId : g.blackId;
      const loser = sw === 1 ? g.blackId : g.whiteId;
      const diff = (sw === 1 ? g.blackRatingBefore - g.whiteRatingBefore : g.whiteRatingBefore - g.blackRatingBefore);
      if (diff >= 100 && (!upset || diff > upset.diff)) upset = { g, diff, winner, loser };
    }
    for (const [id, before, after] of [
      [g.whiteId, g.whiteRatingBefore, g.whiteRatingAfter],
      [g.blackId, g.blackRatingBefore, g.blackRatingAfter],
    ] as const) {
      if (before !== null && after !== null) gain.set(id, (gain.get(id) ?? 0) + (after - before));
      count.set(id, (count.get(id) ?? 0) + 1);
    }
  }
  if (upset) {
    out.push({ key: "upset", icon: "bolt", title: m.upsetTitle, text: fmt(m.upsetText, { winner: name(upset.winner), loser: name(upset.loser), diff: upset.diff }), playerId: upset.winner, gameId: upset.g.id });
  }
  let hot: { id: string; length: number } | null = null;
  for (const p of db.players) {
    if (!p.active) continue;
    const s = streaks(db, p.id).current;
    if (s && s.kind === "W" && s.length >= 3 && (!hot || s.length > hot.length)) hot = { id: p.id, length: s.length };
  }
  if (hot) out.push({ key: "hot", icon: "flame", title: m.hotTitle, text: fmt(m.hotText, { name: name(hot.id), n: hot.length }), playerId: hot.id });

  const climber = [...gain.entries()].filter(([, v]) => v >= 30).sort((a, b) => b[1] - a[1])[0];
  if (climber) out.push({ key: "climber", icon: "trend", title: m.climberTitle, text: fmt(m.climberText, { name: name(climber[0]), n: climber[1], days }), playerId: climber[0] });

  const busiest = [...count.entries()].sort((a, b) => b[1] - a[1])[0];
  if (busiest && busiest[1] >= 3) out.push({ key: "busiest", icon: "pawn", title: m.busiestTitle, text: fmt(m.busiestText, { name: name(busiest[0]), n: busiest[1], days }), playerId: busiest[0] });

  const newcomer = db.players.filter((p) => p.createdAt >= since && p.gamesPlayed > 0).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (newcomer) out.push({ key: "newcomer", icon: "sparkle", title: m.newcomerTitle, text: fmt(plural(newcomer.gamesPlayed, m.newcomerText), { name: newcomer.name }), playerId: newcomer.id });

  const season = currentSeason(db);
  if (season) {
    const table = seasonTable(db, season);
    if (table.length >= 2 && table[0].points - table[1].points <= 1 && table[0].games >= 3) {
      const gap = table[0].points - table[1].points;
      const vars = { leader: name(table[0].playerId), second: name(table[1].playerId) };
      out.push({ key: "race", icon: "flag", title: fmt(m.raceTitle, { season: season.name }), text: gap === 0 ? fmt(m.raceTextTied, vars) : fmt(plural(gap, m.raceText), vars), playerId: table[0].playerId });
    }
  }
  return out.slice(0, 5);
}

/** Days until an ISO date (negative when past), or null when empty. */
export function daysUntil(iso: string): number | null {
  return daysFromToday(iso);
}
