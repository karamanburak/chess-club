"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { AsyncLocalStorage } from "node:async_hooks";
import { BACKUP_NAME_RE, deleteBackup, migrate, mutate, newId, readBackup, readDb, replaceDb, snapshotLabel, takeSnapshot } from "./db";
import { mergeCheck, mergePlayers as mergeRecords, type MergeProblem } from "./merge";
import { RESULTS, recomputeRatings } from "./elo";
import { generatePairings, nextPowerOfTwo, roundRobinSchedule, shuffle } from "./pairing";
import {
  activeParticipants,
  activeSession,
  colorStats,
  knockoutRounds,
  previousPairs,
  resultLabel,
  roundComplete,
  roundHasResults,
  roundRobinRounds,
  sessionRoundComplete,
  standings,
  TIEBREAK_PRESETS,
} from "./queries";
import { adminConfigured, clearMeCookie, clearSessionCookie, currentPlayerId, hashPassword, isAdmin, requireAdmin, rotateSessionSecret, setMeCookie, setMemberCookie, setSessionCookie, verifyPassword } from "./auth";
import { timingSafeEqual } from "node:crypto";
import { UserError } from "./errors";
import { makeGame } from "./games";
import { generateKnockoutRound, syncKnockout } from "./knockout";
import { isAvatar, randomAvatar } from "./avatar";
import { clearFails, isLocked, LOCK_MAX_FAILS, LOCK_MINUTES, registerFail } from "./lockout";
import { clearPinFails, PIN_RE, pinLocked, registerPinFail } from "./pin";
import { applyReset, isResetScope, type ResetScope } from "./reset";
import { SKIP_COOKIE, SKIP_DAYS } from "./tokens";
import { fmt, isLang, LANG_COOKIE, type Dict, type Lang } from "./i18n";
import { getT } from "./lang";
import { currentSeason, seasonTable } from "./club";
import type { Database, Game, GameResult, PairingMode, TiebreakKey, Tournament } from "./types";

function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function num(fd: FormData, key: string, fallback: number): number {
  const n = Number(str(fd, key));
  return Number.isFinite(n) && str(fd, key) !== "" ? n : fallback;
}

type Msgs = Dict["errors"];

/** The user-facing messages in this request's language. Fetch it before mutate(): its callback is synchronous. */
async function msgs(): Promise<Msgs> {
  return (await getT()).t.errors;
}

function parseResult(value: string, E: Msgs): GameResult {
  if (!RESULTS.includes(value as GameResult)) throw new UserError(fmt(E.invalidResult, { value }));
  return value as GameResult;
}

function revalidateAll() {
  revalidatePath("/", "layout");
}

/* ------------------------------------------------------------------ */
/* Action plumbing: user-facing errors, activity log                   */
/* ------------------------------------------------------------------ */

const actor = new AsyncLocalStorage<{ admin: boolean; owner?: boolean }>();

/** Builds the URL of the page the request came from, with the message attached as a flash toast. */
function flashUrl(referer: string | null, message: string): string {
  let pathname = "/";
  let search = new URLSearchParams();
  if (referer) {
    try {
      const u = new URL(referer);
      pathname = u.pathname;
      search = u.searchParams;
    } catch {
      /* keep defaults */
    }
  }
  search.set("flash", message);
  return `${pathname}?${search.toString()}`;
}

/**
 * Runs a form action. A UserError does not crash to the error boundary (whose
 * message Next.js hides in production) but sends the user back to the page
 * they were on with the message shown as a toast.
 */
async function run(fn: () => void | Promise<void>): Promise<void> {
  const h = await headers();
  const admin = await isAdmin();
  try {
    await actor.run({ admin }, fn);
  } catch (e) {
    if (e instanceof UserError) redirect(flashUrl(h.get("referer"), e.message));
    throw e;
  }
}

/** Like run(), for actions called directly from client components: the error is returned instead of redirecting. */
async function attempt(fn: () => void | Promise<void>): Promise<{ error?: string }> {
  const admin = await isAdmin();
  try {
    await actor.run({ admin }, fn);
    return {};
  } catch (e) {
    if (e instanceof UserError) return { error: e.message };
    throw e;
  }
}

const LOG_KEEP = 500;

/** Appends a line to the activity log. Must be called inside the mutate() that persists the change. */
function log(db: Database, text: string): void {
  const who = actor.getStore();
  db.activity.push({ id: newId(), at: new Date().toISOString(), admin: who?.admin ?? false, text: who?.owner ? `${text} [owner]` : text });
  if (db.activity.length > LOG_KEEP) db.activity.splice(0, db.activity.length - LOG_KEEP);
}

/** Who is acting: the admin may edit any game, a claimed device only its own boards. */
async function whoActs(): Promise<{ admin: boolean; me: string | null }> {
  return { admin: await isAdmin(), me: await currentPlayerId() };
}

/**
 * The owner password gates the destructive admin tools. While none is set, being admin is enough
 * (the first-run state); once set, the action must carry it as the "owner" form field or as a
 * trailing string argument (ConfirmButton asks for it). Wrong tries share the lockout rules.
 */
async function requireOwner(source: FormData | string | undefined): Promise<void> {
  await requireAdmin();
  const { settings } = await readDb();
  const hash = settings.ownerPasswordHash;
  if (!hash) return;
  const E = await msgs();
  if (isLocked(settings.ownerLock)) throw new UserError(E.ownerLocked);
  const pw = typeof source === "string" ? source.trim() : source instanceof FormData ? str(source, "owner") : "";
  if (!pw) throw new UserError(E.ownerRequired);
  if (!verifyPassword(pw, hash)) {
    const locked = await mutate((db) => {
      registerFail((db.settings.ownerLock ??= {}));
      if (isLocked(db.settings.ownerLock)) log(db, `Owner password locked for ${LOCK_MINUTES} minutes after ${LOCK_MAX_FAILS} wrong tries`);
      return isLocked(db.settings.ownerLock);
    });
    throw new UserError(locked ? E.ownerLocked : E.ownerWrong);
  }
  if (settings.ownerLock) await mutate((db) => delete db.settings.ownerLock);
  const store = actor.getStore();
  if (store) store.owner = true;
}

function mayEditGame(who: { admin: boolean; me: string | null }, g: Pick<Game, "whiteId" | "blackId">): boolean {
  return who.admin || (!!who.me && (g.whiteId === who.me || g.blackId === who.me));
}

function nameOf(db: Database, id: string): string {
  return db.players.find((p) => p.id === id)?.name ?? "?";
}

function whereOf(db: Database, g: Game): string {
  if (g.tournamentId) return db.tournaments.find((t) => t.id === g.tournamentId)?.name ?? "Tournament";
  if (g.sessionId) return "Club night";
  return "Friendly";
}

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** A "YYYY-MM-DD" from a form. Empty or today means right now; an earlier day is stamped at noon so it sorts before today's games. */
function playedAt(date: string, E: Msgs): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date === localToday()) return new Date().toISOString();
  if (date > localToday()) throw new UserError(E.dateInFuture);
  return new Date(`${date}T12:00:00`).toISOString();
}

function parseMode(raw: string): PairingMode {
  return raw === "swiss" || raw === "roundrobin" || raw === "knockout" ? raw : "random";
}

function tiebreaksFrom(fd: FormData, fallback: TiebreakKey[]): TiebreakKey[] {
  const preset = TIEBREAK_PRESETS.find((p) => p.key === str(fd, "tiebreaks"));
  return preset ? [...preset.order] : fallback;
}


/** Per-device UI language (EN/DE), kept in a plain cookie for a year. */
export async function setLanguage(lang: Lang) {
  return attempt(async () => {
    if (!isLang(lang)) throw new UserError((await msgs()).unknownLanguage);
    const jar = await cookies();
    jar.set(LANG_COOKIE, lang, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  });
}

/* ------------------------------------------------------------------ */
/* Admin, settings, backups                                            */
/* ------------------------------------------------------------------ */

export async function setupAdmin(fd: FormData) {
  return run(async () => {
    if (await adminConfigured()) throw new UserError((await msgs()).adminAlreadySet);
    const pw = str(fd, "password");
    if (pw.length < 4) redirect("/admin?error=short");
    if (pw !== str(fd, "confirm")) redirect("/admin?error=mismatch");
    await mutate((db) => {
      db.settings.adminPasswordHash = hashPassword(pw);
      log(db, "Admin password created");
    });
    await setSessionCookie();
    revalidateAll();
    redirect("/admin");
  });
}

export async function login(fd: FormData) {
  return run(async () => {
    const { settings } = await readDb();
    if (isLocked(settings.adminLock)) redirect("/admin?error=locked");
    if (!settings.adminPasswordHash || !verifyPassword(str(fd, "password"), settings.adminPasswordHash)) {
      const locked = await mutate((db) => {
        registerFail((db.settings.adminLock ??= {}));
        if (isLocked(db.settings.adminLock)) log(db, `Admin sign-in locked for ${LOCK_MINUTES} minutes after ${LOCK_MAX_FAILS} wrong passwords`);
        return isLocked(db.settings.adminLock);
      });
      redirect(locked ? "/admin?error=locked" : "/admin?error=wrong");
    }
    await setSessionCookie();
    await mutate((db) => {
      clearFails(db.settings.adminLock);
      delete db.settings.adminLock;
      log(db, "Admin signed in");
    });
    revalidateAll();
    redirect(str(fd, "next") || "/admin");
  });
}

export async function logout() {
  return run(async () => {
    await clearSessionCookie();
    revalidateAll();
    redirect("/");
  });
}

export async function changePassword(fd: FormData) {
  return run(async () => {
    await requireOwner(fd);
    const hash = (await readDb()).settings.adminPasswordHash;
    if (!hash || !verifyPassword(str(fd, "current"), hash)) redirect("/admin?error=wrong");
    const pw = str(fd, "password");
    if (pw.length < 4) redirect("/admin?error=short");
    if (pw !== str(fd, "confirm")) redirect("/admin?error=mismatch");
    await mutate((db) => {
      db.settings.adminPasswordHash = hashPassword(pw);
      log(db, "Admin password changed");
    });
    // Admin cookies are bound to the password hash: every other admin device is now signed out; this one gets a fresh cookie.
    await setSessionCookie();
    redirect("/admin?ok=changed");
  });
}

/**
 * Sets or changes the owner password. The first one may be set by any admin (there is nothing to
 * protect it with yet); afterwards the current owner password is required, never the admin one.
 */
export async function setOwnerPassword(fd: FormData) {
  return run(async () => {
    await requireAdmin();
    const { settings } = await readDb();
    if (settings.ownerPasswordHash) await requireOwner(str(fd, "current"));
    const pw = str(fd, "password");
    if (pw.length < 6) redirect("/admin?error=ownershort");
    if (pw !== str(fd, "confirm")) redirect("/admin?error=mismatch");
    const first = !settings.ownerPasswordHash;
    await mutate((db) => {
      db.settings.ownerPasswordHash = hashPassword(pw);
      delete db.settings.ownerLock;
      log(db, first ? "Owner password set: destructive admin tools now require it" : "Owner password changed");
    });
    revalidateAll();
    redirect(first ? "/admin?ok=ownerset" : "/admin?ok=ownerchanged");
  });
}

/**
 * Forgotten admin or owner password. Only available when the server has ADMIN_RESET_TOKEN in its environment
 * (Vercel → Settings → Environment Variables, or .env.local). The token is compared in constant time;
 * remove it again once the password is set.
 */
export async function resetAdminPassword(fd: FormData) {
  return run(async () => {
    const expected = process.env.ADMIN_RESET_TOKEN?.trim();
    if (!expected) redirect("/admin?error=noreset");
    const given = Buffer.from(str(fd, "token"));
    const want = Buffer.from(expected);
    if (given.length !== want.length || !timingSafeEqual(given, want)) redirect("/admin?error=badtoken");
    const which = str(fd, "which") === "owner" ? "owner" : "admin";
    const pw = str(fd, "password");
    if (pw.length < (which === "owner" ? 6 : 4)) redirect(which === "owner" ? "/admin?error=ownershort" : "/admin?error=short");
    if (pw !== str(fd, "confirm")) redirect("/admin?error=mismatch");
    await mutate((db) => {
      if (which === "owner") {
        db.settings.ownerPasswordHash = hashPassword(pw);
        delete db.settings.ownerLock;
        log(db, "Owner password reset with the recovery token");
      } else {
        db.settings.adminPasswordHash = hashPassword(pw);
        delete db.settings.adminLock;
        log(db, "Admin password reset with the recovery token");
      }
    });
    if (which === "admin") await setSessionCookie();
    revalidateAll();
    redirect(which === "owner" ? "/admin?ok=recoveredowner" : "/admin?ok=recovered");
  });
}

/** Rotates the signing secret: every admin, member and "this is me" cookie on every device stops working, this one included. */
export async function signOutEverywhere(owner?: string) {
  return run(async () => {
    await requireOwner(owner);
    await rotateSessionSecret();
    await mutate((db) => log(db, "All devices signed out (session secret rotated)"));
    await clearSessionCookie();
    revalidateAll();
    redirect("/admin?ok=everyoneout");
  });
}

export async function updateSettings(fd: FormData) {
  return run(async () => {
    await requireAdmin();
    await mutate((db) => {
      db.settings.startRating = Math.round(num(fd, "startRating", db.settings.startRating));
      db.settings.byePoints = str(fd, "byePoints") === "0.5" ? 0.5 : 1;
      db.settings.defaultTiebreaks = tiebreaksFrom(fd, db.settings.defaultTiebreaks);
      const language = str(fd, "language");
      db.settings.language = isLang(language) ? language : "en";
      log(db, `Settings changed: start Elo ${db.settings.startRating}, bye ${db.settings.byePoints}, tiebreaks ${db.settings.defaultTiebreaks.join("/")}, language ${db.settings.language}`);
    });
    revalidateAll();
    redirect("/admin?ok=saved");
  });
}

/** Replaces the database with an uploaded JSON file. The current state is kept as a snapshot first. */
export async function importDatabase(fd: FormData) {
  return run(async () => {
    await requireOwner(fd);
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) redirect("/admin?error=nofile");
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      redirect("/admin?error=badjson");
    }
    const obj = parsed as Record<string, unknown>;
    if (!obj || !Array.isArray(obj.players) || !Array.isArray(obj.games)) redirect("/admin?error=badjson");
    const current = await readDb();
    const next = migrate(obj);
    // Keep the credentials of this installation.
    next.settings.adminPasswordHash = current.settings.adminPasswordHash;
    next.settings.ownerPasswordHash = current.settings.ownerPasswordHash;
    next.settings.sessionSecret = current.settings.sessionSecret;
    recomputeRatings(next);
    log(next, `Database imported from "${file.name}" (${next.players.length} players, ${next.games.length} games)`);
    await replaceDb(next, "before-import");
    revalidateAll();
    redirect("/admin?ok=imported");
  });
}

/** Saves the current state as a named snapshot (`db-<label>-<time>.json`), e.g. before a tournament night. */
export async function createSnapshot(fd: FormData) {
  return run(async () => {
    await requireAdmin();
    const label = snapshotLabel(str(fd, "label"));
    const name = await takeSnapshot(label);
    if (!name) throw new UserError((await msgs()).snapshotFailed);
    await mutate((db) => log(db, `Snapshot ${name} taken`));
    revalidateAll();
    redirect("/admin?ok=snapshot");
  });
}

export async function removeBackup(file: string, owner?: string) {
  return run(async () => {
    await requireOwner(owner);
    const E = await msgs();
    if (!BACKUP_NAME_RE.test(file)) throw new UserError(E.invalidBackupName);
    if (!(await deleteBackup(file))) throw new UserError(E.backupNotFound);
    await mutate((db) => log(db, `Snapshot ${file} deleted`));
    revalidateAll();
  });
}

export async function restoreBackup(file: string, owner?: string) {
  return run(async () => {
    await requireOwner(owner);
    const E = await msgs();
    if (!BACKUP_NAME_RE.test(file)) throw new UserError(E.invalidBackupName);
    const next = await readBackup(file);
    if (!next) throw new UserError(E.backupNotFound);
    const current = await readDb();
    next.settings.adminPasswordHash = current.settings.adminPasswordHash;
    next.settings.ownerPasswordHash = current.settings.ownerPasswordHash;
    next.settings.sessionSecret = current.settings.sessionSecret;
    recomputeRatings(next);
    log(next, `Snapshot ${file} restored`);
    await replaceDb(next, "before-restore");
    revalidateAll();
    redirect("/admin?ok=restored");
  });
}

const MERGE_ERRORS: Record<MergeProblem, keyof Msgs> = {
  same: "mergeSamePlayer",
  notFound: "playerNotFound",
  playedEachOther: "mergePlayedEachOther",
  sharedTournament: "mergeSharedTournament",
  sharedSession: "mergeSharedSession",
};

/**
 * Two records for one person: every game, pairing, bye, seed and championship of `from` moves to
 * `into`, then `from` is deleted. Ratings are replayed. Refused when the two ever met on a board or
 * in the same tournament or club night, because that cannot be one person.
 */
export async function mergePlayers(fd: FormData) {
  return run(async () => {
    await requireOwner(fd);
    const E = await msgs();
    const fromId = str(fd, "fromId");
    const intoId = str(fd, "intoId");
    if (!fromId || !intoId) throw new UserError(E.mergeChooseBoth);
    await mutate((db) => {
      const problem = mergeCheck(db, fromId, intoId);
      if (problem) throw new UserError(E[MERGE_ERRORS[problem]]);
      const fromName = nameOf(db, fromId);
      const intoName = nameOf(db, intoId);
      const moved = mergeRecords(db, fromId, intoId);
      for (const t of db.tournaments) if (t.knockout) syncKnockout(db, t);
      recomputeRatings(db);
      log(db, `Player ${fromName} merged into ${intoName} (${moved.games} games, ${moved.tournaments} tournaments, ${moved.sessions} club nights moved)`);
    });
    revalidateAll();
    redirect("/admin?ok=merged");
  });
}

const RESET_LOG: Record<ResetScope, string> = {
  everything: "Club reset: all players, games, tournaments, club nights and seasons deleted",
  history: "History reset: all games, tournaments, club nights and seasons deleted, players kept",
  tournaments: "All tournaments deleted",
  sessions: "All club nights deleted",
  friendlies: "All friendly games deleted",
};

/**
 * Danger zone: bulk delete. The current state is kept as a labeled snapshot first
 * (`db-before-reset-<scope>-<time>.json`), so a slip can be undone from the backup list.
 */
export async function resetData(scope: ResetScope, owner?: string) {
  return run(async () => {
    await requireOwner(owner);
    if (!isResetScope(scope)) throw new UserError((await msgs()).unknownResetScope);
    const next = structuredClone(await readDb());
    const removed = applyReset(next, scope);
    recomputeRatings(next);
    log(next, `${RESET_LOG[scope]} (${removed.players} players, ${removed.games} games, ${removed.tournaments} tournaments, ${removed.sessions} club nights)`);
    await replaceDb(next, `before-reset-${scope}`);
    revalidateAll();
    redirect(`/admin?ok=reset-${scope}`);
  });
}

export async function updateClub(fd: FormData) {
  return run(async () => {
    await requireAdmin();
    const E = await msgs();
    await mutate((db) => {
      const c = db.settings.club;
      c.name = str(fd, "name") || c.name;
      c.meets = str(fd, "meets");
      const next = str(fd, "nextNight");
      if (next && !/^\d{4}-\d{2}-\d{2}$/.test(next)) throw new UserError(E.nextNightNeedsDate);
      c.nextNight = next;
      c.announcement = str(fd, "announcement").slice(0, 300);
      log(db, `Club identity edited: ${c.name}`);
    });
    revalidateAll();
    redirect("/admin?ok=club");
  });
}

/* ------------------------------------------------------------------ */
/* Member code                                                         */
/* ------------------------------------------------------------------ */

/** Sets or changes the club-wide member code. Every member is asked for the new one once. */
export async function setMemberCode(fd: FormData) {
  return run(async () => {
    await requireOwner(fd);
    const code = str(fd, "code");
    if (code.length < 4) redirect("/admin?error=codeshort");
    if (code !== str(fd, "confirm")) redirect("/admin?error=codemismatch");
    await mutate((db) => {
      db.settings.memberCodeHash = hashPassword(code);
      log(db, "Member code set: members will be asked for it once per device");
    });
    revalidateAll();
    redirect("/admin?ok=member");
  });
}

/** Turns the door code off: the club is open to anyone who knows the address again. */
export async function clearMemberCode(owner?: string) {
  return run(async () => {
    await requireOwner(owner);
    await mutate((db) => {
      delete db.settings.memberCodeHash;
      log(db, "Member code turned off");
    });
    revalidateAll();
    redirect("/admin?ok=memberoff");
  });
}

/** A visitor types the member code on /join. */
export async function joinClub(fd: FormData) {
  return run(async () => {
    const db = await readDb();
    const hash = db.settings.memberCodeHash;
    const next = str(fd, "next").startsWith("/") ? str(fd, "next") : "/";
    if (!hash) redirect(next);
    const back = (error: string) => `/join?error=${error}&next=${encodeURIComponent(next)}`;
    if (isLocked(db.settings.memberLock)) redirect(back("locked"));
    if (!verifyPassword(str(fd, "code"), hash)) {
      const locked = await mutate((d) => {
        registerFail((d.settings.memberLock ??= {}));
        if (isLocked(d.settings.memberLock)) log(d, `Member code locked for ${LOCK_MINUTES} minutes after ${LOCK_MAX_FAILS} wrong codes`);
        return isLocked(d.settings.memberLock);
      });
      redirect(back(locked ? "locked" : "wrong"));
    }
    if (db.settings.memberLock) await mutate((d) => delete d.settings.memberLock);
    await setMemberCookie(hash);
    revalidateAll();
    redirect(next);
  });
}

/* ------------------------------------------------------------------ */
/* Seasons                                                             */
/* ------------------------------------------------------------------ */

export async function startSeason(fd: FormData) {
  return run(async () => {
    await requireAdmin();
    const E = await msgs();
    await mutate((db) => {
      if (currentSeason(db)) throw new UserError(E.closeSeasonFirst);
      const start = str(fd, "start") || localToday();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) throw new UserError(E.seasonNeedsStart);
      const lastEnd = db.seasons.map((s) => s.end ?? "").sort().at(-1) ?? "";
      if (lastEnd && start <= lastEnd) throw new UserError(fmt(E.seasonMustStartAfter, { date: lastEnd }));
      const name = str(fd, "name") || fmt(E.defaultSeasonName, { year: start.slice(0, 4) });
      db.seasons.push({ id: newId(), name, start, end: null, championId: null });
      log(db, `${name} started (${start})`);
    });
    revalidateAll();
    redirect("/admin?ok=season");
  });
}

/** Ends the running season today and crowns whoever tops its table. */
export async function closeSeason(id: string) {
  return run(async () => {
    await requireAdmin();
    const E = await msgs();
    await mutate((db) => {
      const s = db.seasons.find((x) => x.id === id);
      if (!s) return;
      if (s.end) throw new UserError(E.seasonAlreadyClosed);
      const end = localToday();
      s.end = end < s.start ? s.start : end;
      const table = seasonTable(db, s);
      s.championId = table[0]?.playerId ?? null;
      log(db, `${s.name} closed${s.championId ? `, champion ${nameOf(db, s.championId)}` : ""}`);
    });
    revalidateAll();
  });
}

export async function reopenSeason(id: string) {
  return run(async () => {
    await requireAdmin();
    const E = await msgs();
    await mutate((db) => {
      const s = db.seasons.find((x) => x.id === id);
      if (!s) return;
      if (currentSeason(db)) throw new UserError(E.anotherSeasonRunning);
      const later = db.seasons.some((x) => x.id !== id && x.start > s.start);
      if (later) throw new UserError(E.onlyLatestSeasonReopens);
      s.end = null;
      s.championId = null;
      log(db, `${s.name} reopened`);
    });
    revalidateAll();
  });
}

export async function renameSeason(id: string, fd: FormData) {
  return run(async () => {
    await requireAdmin();
    const E = await msgs();
    await mutate((db) => {
      const s = db.seasons.find((x) => x.id === id);
      if (!s) return;
      const name = str(fd, "name");
      if (!name) throw new UserError(E.seasonNeedsName);
      log(db, `Season "${s.name}" renamed to "${name}"`);
      s.name = name;
    });
    revalidateAll();
  });
}

/* ------------------------------------------------------------------ */
/* Players                                                             */
/* ------------------------------------------------------------------ */

/** Admin adds anyone. Members add only themselves, see registerSelf(). */
export async function addPlayer(fd: FormData) {
  return run(async () => {
    await requireAdmin();
    const name = str(fd, "name");
    if (!name) return;
    const E = await msgs();
    await mutate((db) => {
      if (db.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) throw new UserError(fmt(E.playerExists, { name }));
      const rating = num(fd, "rating", db.settings.startRating);
      db.players.push({
        id: newId(),
        name,
        initialRating: rating,
        rating,
        gamesPlayed: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        active: true,
        createdAt: new Date().toISOString(),
        avatar: randomAvatar(),
      });
      log(db, `Player ${name} added (start Elo ${rating})`);
      recomputeRatings(db);
    });
    revalidateAll();
  });
}

export async function updatePlayer(id: string, fd: FormData) {
  return run(async () => {
    await requireAdmin();
    const name = str(fd, "name");
    await mutate((db) => {
      const p = db.players.find((x) => x.id === id);
      if (!p) return;
      if (name) p.name = name;
      p.initialRating = num(fd, "initialRating", p.initialRating);
      p.active = fd.get("active") === "on";
      p.note = str(fd, "note") || undefined;
      const avatar = str(fd, "avatar");
      if (avatar && isAvatar(avatar)) p.avatar = avatar;
      log(db, `Player ${p.name} edited (start Elo ${p.initialRating}, ${p.active ? "active" : "inactive"}, ${p.avatar})`);
      recomputeRatings(db);
    });
    revalidateAll();
  });
}

/** Changes a profile picture: the player themselves (device claimed via "This is me") or the admin. */
export async function setAvatar(id: string, seed: string) {
  return attempt(async () => {
    const E = await msgs();
    if (!(await isAdmin()) && (await currentPlayerId()) !== id) {
      throw new UserError(E.avatarNotYours);
    }
    if (!isAvatar(seed)) throw new UserError(E.invalidAvatar);
    await mutate((db) => {
      const p = db.players.find((x) => x.id === id);
      if (!p) throw new UserError(E.playerNotFound);
      p.avatar = seed;
      log(db, `Player ${p.name} got a new avatar`);
    });
    revalidateAll();
  });
}

/* ------------------------------------------------------------------ */
/* Identity: "This is me" with a four-digit PIN                        */
/* ------------------------------------------------------------------ */

/** A newcomer adds themselves once: name plus PIN, and this device becomes theirs right away. */
export async function registerSelf(fd: FormData) {
  return run(async () => {
    const E = await msgs();
    if (await currentPlayerId()) throw new UserError(E.deviceAlreadyClaimed);
    const name = str(fd, "name");
    if (name.length < 2) throw new UserError(E.enterName);
    const pin = str(fd, "pin");
    if (!PIN_RE.test(pin)) throw new UserError(E.pinFormat);
    if (pin !== str(fd, "confirm")) throw new UserError(E.pinMismatch);
    const id = newId();
    await mutate((db) => {
      if (db.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
        throw new UserError(fmt(E.nameAlreadyListed, { name }));
      }
      const rating = db.settings.startRating;
      db.players.push({
        id,
        name,
        initialRating: rating,
        rating,
        gamesPlayed: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        active: true,
        createdAt: new Date().toISOString(),
        avatar: randomAvatar(),
        pinHash: hashPassword(pin),
      });
      log(db, `${name} joined the club (start Elo ${rating})`);
      recomputeRatings(db);
    });
    await setMeCookie(id);
    revalidateAll();
    redirect(noticeUrl(`/players/${id}`, fmt(E.welcomeNew, { name })));
  });
}

function noticeUrl(path: string, message: string): string {
  return `${path}${path.includes("?") ? "&" : "?"}notice=${encodeURIComponent(message)}`;
}

/**
 * A visitor picks a player and proves it with the PIN. The first time a
 * player is claimed there is no PIN yet: the visitor sets it (twice).
 */
export async function claimWithPin(fd: FormData) {
  return run(async () => {
    const id = str(fd, "playerId");
    const pin = str(fd, "pin");
    const next = str(fd, "next").startsWith("/") ? str(fd, "next") : "";
    const back = (error: string): never => redirect(`/me?player=${encodeURIComponent(id)}&error=${error}${next ? `&next=${encodeURIComponent(next)}` : ""}`);
    const E = await msgs();
    const db = await readDb();
    const p = db.players.find((x) => x.id === id);
    if (!p) throw new UserError(E.playerNotFound);
    if (!PIN_RE.test(pin)) back("short");
    if (!p.pinHash) {
      if (pin !== str(fd, "confirm")) back("mismatch");
      await mutate((d) => {
        const q = d.players.find((x) => x.id === id)!;
        if (q.pinHash) throw new UserError(E.pinJustSet);
        q.pinHash = hashPassword(pin);
        log(d, `${q.name} set their PIN and claimed their profile`);
      });
    } else {
      if (pinLocked(p)) back("locked");
      if (!verifyPassword(pin, p.pinHash)) {
        await mutate((d) => {
          const q = d.players.find((x) => x.id === id);
          if (q) {
            registerPinFail(q);
            if (q.pinLockedUntil) log(d, `Too many wrong PINs for ${q.name}; locked for a while`);
          }
        });
        back("wrong");
      }
      if (p.pinFails || p.pinLockedUntil) await mutate((d) => clearPinFails(d.players.find((x) => x.id === id)!));
    }
    await setMeCookie(id);
    revalidateAll();
    redirect(noticeUrl(next || `/players/${id}`, fmt(E.welcomeBack, { name: p.name })));
  });
}

/** "Just browsing": no identity on this device for a while; results can still be entered. */
export async function skipIdentity(fd: FormData) {
  return run(async () => {
    const next = str(fd, "next").startsWith("/") ? str(fd, "next") : "/";
    const jar = await cookies();
    jar.set(SKIP_COOKIE, "1", { httpOnly: true, sameSite: "lax", path: "/", maxAge: SKIP_DAYS * 86400 });
    redirect(next);
  });
}

/** The player changes their own PIN (current one required). */
export async function changeOwnPin(fd: FormData) {
  return run(async () => {
    const id = str(fd, "playerId");
    const E = await msgs();
    if ((await currentPlayerId()) !== id) throw new UserError(E.pinNotYours);
    const current = str(fd, "current");
    const pin = str(fd, "pin");
    if (!PIN_RE.test(pin)) throw new UserError(E.newPinFormat);
    if (pin !== str(fd, "confirm")) throw new UserError(E.newPinMismatch);
    const db = await readDb();
    const p = db.players.find((x) => x.id === id);
    if (!p) throw new UserError(E.playerNotFound);
    if (p.pinHash && !verifyPassword(current, p.pinHash)) throw new UserError(E.currentPinWrong);
    await mutate((d) => {
      const q = d.players.find((x) => x.id === id)!;
      q.pinHash = hashPassword(pin);
      clearPinFails(q);
      log(d, `${q.name} changed their PIN`);
    });
    revalidateAll();
    redirect(noticeUrl(`/players/${id}`, E.pinChanged));
  });
}

/** Admin sets a new PIN for someone who forgot theirs, or clears it so they choose one on their next claim. */
export async function resetPin(id: string, fd: FormData) {
  return run(async () => {
    await requireAdmin();
    const E = await msgs();
    const pin = str(fd, "pin");
    if (pin && !PIN_RE.test(pin)) throw new UserError(E.pinFormatOrEmpty);
    await mutate((d) => {
      const q = d.players.find((x) => x.id === id);
      if (!q) throw new UserError(E.playerNotFound);
      if (pin) q.pinHash = hashPassword(pin);
      else delete q.pinHash;
      clearPinFails(q);
      log(d, pin ? `Admin set a new PIN for ${q.name}` : `Admin cleared the PIN of ${q.name}; they choose a new one on their next claim`);
    });
    revalidateAll();
    redirect(noticeUrl(`/players/${id}`, pin ? E.pinSetByAdmin : E.pinCleared));
  });
}

export async function unclaimProfile() {
  return run(async () => {
    await clearMeCookie();
    revalidateAll();
  });
}

/** Removes the player together with every game they played. Tournament pairings involving them are dropped. */
export async function deletePlayer(id: string) {
  return run(async () => {
    await requireAdmin();
    await mutate((db) => {
      const removedGames = new Set(db.games.filter((g) => g.whiteId === id || g.blackId === id).map((g) => g.id));
      db.games = db.games.filter((g) => !removedGames.has(g.id));
      for (const t of db.tournaments) {
        t.participantIds = t.participantIds.filter((p) => p !== id);
        t.withdrawnIds = t.withdrawnIds.filter((p) => p !== id);
        if (t.rrOrder) t.rrOrder = t.rrOrder.filter((p) => p !== id);
        for (const r of t.rounds) {
          r.pairings = r.pairings.filter((p) => !removedGames.has(p.gameId));
          if (r.byePlayerId === id) r.byePlayerId = null;
        }
      }
      for (const s of db.sessions) {
        s.presentIds = s.presentIds.filter((p) => p !== id);
        for (const r of s.rounds) {
          r.pairings = r.pairings.filter((p) => !removedGames.has(p.gameId));
          if (r.byePlayerId === id) r.byePlayerId = null;
        }
      }
      log(db, `Player ${nameOf(db, id)} deleted together with ${removedGames.size} games`);
      db.players = db.players.filter((p) => p.id !== id);
      recomputeRatings(db);
    });
    revalidateAll();
    redirect("/players");
  });
}

/* ------------------------------------------------------------------ */
/* Games                                                               */
/* ------------------------------------------------------------------ */

export async function recordFriendlyGame(fd: FormData) {
  return run(async () => {
    const E = await msgs();
    const whiteId = str(fd, "whiteId");
    const blackId = str(fd, "blackId");
    const result = parseResult(str(fd, "result"), E);
    if (!whiteId || !blackId || whiteId === blackId) return;
    const who = await whoActs();
    if (!mayEditGame(who, { whiteId, blackId })) throw new UserError(who.me ? E.friendlyNotYours : E.claimFirst);
    await mutate((db) => {
      const g = makeGame(db, { whiteId, blackId, rated: fd.get("rated") !== "off", tournamentId: null, round: null, board: null, sessionId: null });
      g.result = result;
      const when = playedAt(str(fd, "date"), E);
      g.createdAt = when;
      g.completedAt = when;
      db.games.push(g);
      log(db, `Friendly game ${nameOf(db, whiteId)} – ${nameOf(db, blackId)}: ${resultLabel(result)}${g.rated ? "" : " (unrated)"}${when.slice(0, 10) !== new Date().toISOString().slice(0, 10) ? ` played ${when.slice(0, 10)}` : ""}`);
      recomputeRatings(db);
    });
    revalidateAll();
  });
}

export async function setGameResult(gameId: string, result: GameResult | null) {
  return attempt(async () => {
    const E = await msgs();
    const who = await whoActs();
    if (result !== null) parseResult(result, E);
    await mutate((db) => {
      const g = db.games.find((x) => x.id === gameId);
      if (!g) return;
      if (!mayEditGame(who, g)) throw new UserError(who.me ? E.notYourGame : E.claimFirst);
      const t = g.tournamentId ? db.tournaments.find((x) => x.id === g.tournamentId) : undefined;
      if (t?.knockout && g.round !== null && g.round < t.rounds.length) {
        throw new UserError(E.knockoutRoundLocked);
      }
      g.result = result;
      g.completedAt = result ? (g.completedAt ?? new Date().toISOString()) : null;
      log(db, `${whereOf(db, g)}: ${nameOf(db, g.whiteId)} – ${nameOf(db, g.blackId)} ${result ? resultLabel(result) : "result cleared"}`);
      if (t?.knockout) syncKnockout(db, t);
      recomputeRatings(db);
    });
    revalidateAll();
  });
}

export async function swapColors(gameId: string) {
  return attempt(async () => {
    const E = await msgs();
    const who = await whoActs();
    await mutate((db) => {
      const g = db.games.find((x) => x.id === gameId);
      if (!g) return;
      if (!mayEditGame(who, g)) throw new UserError(who.me ? E.notYourGame : E.claimFirst);
      if (g.result) throw new UserError(E.clearResultBeforeSwap);
      [g.whiteId, g.blackId] = [g.blackId, g.whiteId];
      log(db, `${whereOf(db, g)}: colors swapped, ${nameOf(db, g.whiteId)} now white against ${nameOf(db, g.blackId)}`);
      for (const t of db.tournaments)
        for (const r of t.rounds)
          for (const p of r.pairings) if (p.gameId === gameId) [p.whiteId, p.blackId] = [p.blackId, p.whiteId];
      for (const s of db.sessions)
        for (const r of s.rounds)
          for (const p of r.pairings) if (p.gameId === gameId) [p.whiteId, p.blackId] = [p.blackId, p.whiteId];
    });
    revalidateAll();
  });
}

export async function deleteGame(gameId: string) {
  return run(async () => {
    await requireAdmin();
    const E = await msgs();
    await mutate((db) => {
      const g = db.games.find((x) => x.id === gameId);
      if (!g) return;
      if (g.tournamentId) throw new UserError(E.tournamentGamesViaRound);
      log(db, `${whereOf(db, g)}: game ${nameOf(db, g.whiteId)} – ${nameOf(db, g.blackId)} deleted`);
      db.games = db.games.filter((x) => x.id !== gameId);
      for (const s of db.sessions) for (const r of s.rounds) r.pairings = r.pairings.filter((p) => p.gameId !== gameId);
      recomputeRatings(db);
    });
    revalidateAll();
  });
}

/* ------------------------------------------------------------------ */
/* Tournaments                                                         */
/* ------------------------------------------------------------------ */

export async function createTournament(fd: FormData) {
  return run(async () => {
    const name = str(fd, "name");
    if (!name) return;
    const mode = parseMode(str(fd, "pairingMode"));
    const id = newId();
    await mutate((db) => {
      const participantIds = fd.getAll("participantIds").map(String);
      const t: Tournament = {
        id,
        name,
        date: str(fd, "date") || new Date().toISOString().slice(0, 10),
        status: "planned",
        pairingMode: mode,
        plannedRounds: Math.max(1, Math.round(num(fd, "plannedRounds", 5))),
        rated: fd.get("rated") !== "off",
        timeControl: str(fd, "timeControl"),
        tiebreaks: tiebreaksFrom(fd, mode === "roundrobin" ? TIEBREAK_PRESETS.find((p) => p.key === "rr")!.order : db.settings.defaultTiebreaks),
        byePoints: str(fd, "byePoints") === "0.5" ? 0.5 : db.settings.byePoints,
        participantIds,
        withdrawnIds: [],
        rounds: [],
        createdAt: new Date().toISOString(),
      };
      if (mode === "roundrobin") t.plannedRounds = roundRobinRounds(t);
      if (mode === "knockout") {
        t.knockout = {
          gamesPerMatch: str(fd, "gamesPerMatch") === "2" ? 2 : 1,
          thirdPlace: fd.get("thirdPlace") === "on",
          bracketSize: nextPowerOfTwo(participantIds.length),
          matches: [],
        };
        t.plannedRounds = knockoutRounds(t);
      }
      db.tournaments.push(t);
      log(db, `Tournament "${t.name}" created (${mode}, ${participantIds.length} players)`);
    });
    revalidateAll();
    redirect(`/tournaments/${id}`);
  });
}

export async function updateTournament(id: string, fd: FormData) {
  return run(async () => {
    await requireAdmin();
    await mutate((db) => {
      const t = db.tournaments.find((x) => x.id === id);
      if (!t) return;
      const name = str(fd, "name");
      if (name) t.name = name;
      if (str(fd, "date")) t.date = str(fd, "date");
      t.timeControl = str(fd, "timeControl");
      t.tiebreaks = tiebreaksFrom(fd, t.tiebreaks);
      if (t.pairingMode !== "roundrobin" && t.pairingMode !== "knockout") {
        t.plannedRounds = Math.max(Math.max(1, t.rounds.length), Math.round(num(fd, "plannedRounds", t.plannedRounds)));
      }
      if (t.status === "planned") {
        t.pairingMode = parseMode(str(fd, "pairingMode"));
        if (t.pairingMode === "roundrobin") t.plannedRounds = roundRobinRounds(t);
        if (t.pairingMode === "knockout") {
          t.knockout = {
            gamesPerMatch: str(fd, "gamesPerMatch") === "2" ? 2 : 1,
            thirdPlace: fd.get("thirdPlace") === "on",
            bracketSize: nextPowerOfTwo(t.participantIds.length),
            matches: [],
          };
          t.plannedRounds = knockoutRounds(t);
        } else {
          delete t.knockout;
        }
        t.rated = fd.get("rated") === "on";
        t.byePoints = str(fd, "byePoints") === "0.5" ? 0.5 : 1;
      }
      log(db, `Tournament "${t.name}" settings edited`);
    });
    revalidateAll();
  });
}

export async function setParticipants(id: string, fd: FormData) {
  return run(async () => {
    const E = await msgs();
    await mutate((db) => {
      const t = db.tournaments.find((x) => x.id === id);
      if (!t) return;
      if ((t.pairingMode === "roundrobin" || t.pairingMode === "knockout") && t.rounds.length) throw new UserError(E.fieldFixed);
      const chosen = new Set(fd.getAll("participantIds").map(String));
      const locked = new Set<string>();
      for (const r of t.rounds) {
        if (r.byePlayerId) locked.add(r.byePlayerId);
        for (const p of r.pairings) {
          locked.add(p.whiteId);
          locked.add(p.blackId);
        }
      }
      for (const l of locked) chosen.add(l);
      t.participantIds = db.players.filter((p) => chosen.has(p.id)).map((p) => p.id);
      log(db, `Tournament "${t.name}": field set to ${t.participantIds.length} players`);
      if (t.pairingMode === "roundrobin") t.plannedRounds = roundRobinRounds(t);
      if (t.pairingMode === "knockout" && t.knockout) {
        t.knockout.bracketSize = nextPowerOfTwo(t.participantIds.length);
        t.plannedRounds = knockoutRounds(t);
      }
    });
    revalidateAll();
  });
}

/** A withdrawn player keeps their results but is skipped in future pairings. */
export async function toggleWithdraw(id: string, playerId: string) {
  return run(async () => {
    await mutate((db) => {
      const t = db.tournaments.find((x) => x.id === id);
      if (!t) return;
      if (t.withdrawnIds.includes(playerId)) {
        t.withdrawnIds = t.withdrawnIds.filter((p) => p !== playerId);
        log(db, `Tournament "${t.name}": ${nameOf(db, playerId)} rejoined`);
      } else {
        t.withdrawnIds.push(playerId);
        log(db, `Tournament "${t.name}": ${nameOf(db, playerId)} withdrew`);
      }
    });
    revalidateAll();
  });
}

export async function generateNextRound(id: string) {
  return run(async () => {
    const E = await msgs();
    const round = await mutate((db): number | undefined => {
      const t = db.tournaments.find((x) => x.id === id);
      if (!t) return;
      if (t.status === "finished") throw new UserError(E.tournamentFinished);
      const last = t.rounds[t.rounds.length - 1];
      if (last && !roundComplete(db, t, last.number)) throw new UserError(E.enterAllResultsFirst);
      if (t.rounds.length >= t.plannedRounds) throw new UserError(E.allRoundsPlayed);
      const roundNumber = t.rounds.length + 1;
      log(db, `Tournament "${t.name}": round ${roundNumber} drawn`);

      let pairs: { whiteId: string; blackId: string; forfeitGameId?: string }[];
      let byeId: string | null;

      if (t.pairingMode === "knockout") {
        generateKnockoutRound(db, t, E);
        t.status = "running";
        recomputeRatings(db);
        return t.rounds.length;
      }

      if (t.pairingMode === "roundrobin") {
        if (t.participantIds.length < 2) throw new UserError(E.twoParticipants);
        if (!t.rrOrder || !t.rounds.length) t.rrOrder = shuffle(t.participantIds);
        const schedule = roundRobinSchedule(t.rrOrder);
        const r = schedule[roundNumber - 1];
        if (!r) throw new UserError(E.roundRobinComplete);
        const withdrawn = new Set(t.withdrawnIds);
        pairs = r.pairs.filter((p) => !withdrawn.has(p.whiteId) && !withdrawn.has(p.blackId));
        byeId = r.byeId && !withdrawn.has(r.byeId) ? r.byeId : null;
        // Withdrawn opponent → the remaining player gets a forfeit win, recorded as a game.
        for (const p of r.pairs) {
          const wW = withdrawn.has(p.whiteId);
          const bW = withdrawn.has(p.blackId);
          if (wW !== bW) {
            const g = makeGame(db, { whiteId: p.whiteId, blackId: p.blackId, rated: false, tournamentId: t.id, round: roundNumber, board: 0, sessionId: null });
            g.result = wW ? "-/+" : "+/-";
            g.completedAt = new Date().toISOString();
            db.games.push(g);
            pairs.push({ whiteId: p.whiteId, blackId: p.blackId, forfeitGameId: g.id });
          }
        }
      } else {
        const active = activeParticipants(t);
        if (active.length < 2) throw new UserError(E.twoActiveParticipants);
        const table = standings(db, t).filter((r) => !r.withdrawn);
        const byeHistory = new Set(t.rounds.map((r) => r.byePlayerId).filter((x): x is string => !!x));
        const out = generatePairings({
          players: table.map((r) => ({ id: r.playerId, score: r.points, rating: r.rating })),
          previousPairs: previousPairs(db, { tournamentId: t.id }),
          colorStats: colorStats(db, { tournamentId: t.id }),
          byeHistory,
          mode: t.pairingMode,
        });
        pairs = out.pairs;
        byeId = out.byeId;
      }

      let board = 0;
      const pairings = pairs.map((p) => {
        board += 1;
        if (p.forfeitGameId) {
          const g = db.games.find((x) => x.id === p.forfeitGameId)!;
          g.board = board;
          return { board, whiteId: p.whiteId, blackId: p.blackId, gameId: g.id };
        }
        const g = makeGame(db, { whiteId: p.whiteId, blackId: p.blackId, rated: t.rated, tournamentId: t.id, round: roundNumber, board, sessionId: null });
        db.games.push(g);
        return { board, whiteId: p.whiteId, blackId: p.blackId, gameId: g.id };
      });
      t.rounds.push({ number: roundNumber, pairings, byePlayerId: byeId, createdAt: new Date().toISOString() });
      t.status = "running";
      recomputeRatings(db);
      return roundNumber;
    });
    revalidateAll();
    if (round) redirect(`/tournaments/${id}?reveal=${round}`); // one-time board reveal, see PairingReveal
  });
}

/** Manually rewrite the boards of a round that has no results yet. */
export async function updateRoundPairings(id: string, roundNumber: number, fd: FormData) {
  return run(async () => {
    const E = await msgs();
    await mutate((db) => {
      const t = db.tournaments.find((x) => x.id === id);
      if (!t) return;
      const round = t.rounds.find((r) => r.number === roundNumber);
      if (!round) return;
      if (t.pairingMode === "knockout") throw new UserError(E.knockoutNoManualEdit);
      if (roundHasResults(db, round)) throw new UserError(E.roundHasResultsClearFirst);

      const seen = new Set<string>();
      const use = (pid: string) => {
        if (!pid) return;
        if (seen.has(pid)) throw new UserError(E.playerOnTwoBoards);
        seen.add(pid);
      };
      const newPairs: { whiteId: string; blackId: string }[] = [];
      for (let i = 0; i < round.pairings.length; i++) {
        const w = str(fd, `white_${i}`);
        const b = str(fd, `black_${i}`);
        if (!w && !b) continue;
        if (!w || !b) throw new UserError(fmt(E.boardNeedsTwo, { n: i + 1 }));
        if (w === b) throw new UserError(fmt(E.boardSamePlayer, { n: i + 1 }));
        use(w);
        use(b);
        newPairs.push({ whiteId: w, blackId: b });
      }
      const bye = str(fd, "bye");
      if (bye) use(bye);

      const oldGameIds = new Set(round.pairings.map((p) => p.gameId));
      db.games = db.games.filter((g) => !oldGameIds.has(g.id));
      round.pairings = newPairs.map((p, i) => {
        const g = makeGame(db, { whiteId: p.whiteId, blackId: p.blackId, rated: t.rated, tournamentId: t.id, round: roundNumber, board: i + 1, sessionId: null });
        db.games.push(g);
        return { board: i + 1, whiteId: p.whiteId, blackId: p.blackId, gameId: g.id };
      });
      round.byePlayerId = bye || null;
      log(db, `Tournament "${t.name}": boards of round ${roundNumber} edited by hand`);
    });
    revalidateAll();
  });
}

export async function deleteLastRound(id: string) {
  return run(async () => {
    await requireAdmin();
    await mutate((db) => {
      const t = db.tournaments.find((x) => x.id === id);
      if (!t || !t.rounds.length) return;
      const last = t.rounds.pop()!;
      log(db, `Tournament "${t.name}": round ${last.number} deleted`);
      const ids = new Set(last.pairings.map((p) => p.gameId));
      db.games = db.games.filter((g) => !ids.has(g.id));
      if (t.knockout) t.knockout.matches = t.knockout.matches.filter((m) => m.round !== last.number);
      if (!t.rounds.length) {
        t.status = "planned";
        delete t.rrOrder;
      } else if (t.status === "finished") t.status = "running";
      recomputeRatings(db);
    });
    revalidateAll();
  });
}

export async function setTournamentStatus(id: string, status: Tournament["status"]) {
  return run(async () => {
    await mutate((db) => {
      const t = db.tournaments.find((x) => x.id === id);
      if (!t) return;
      t.status = status;
      log(db, `Tournament "${t.name}" marked ${status}`);
    });
    revalidateAll();
  });
}

export async function deleteTournament(id: string) {
  return run(async () => {
    await requireAdmin();
    await mutate((db) => {
      log(db, `Tournament "${db.tournaments.find((t) => t.id === id)?.name ?? "?"}" deleted`);
      db.tournaments = db.tournaments.filter((t) => t.id !== id);
      db.games = db.games.filter((g) => g.tournamentId !== id);
      recomputeRatings(db);
    });
    revalidateAll();
    redirect("/tournaments");
  });
}

/* ------------------------------------------------------------------ */
/* Club nights                                                         */
/* ------------------------------------------------------------------ */

function pairSessionRound(db: Database, sessionId: string, E: Msgs): number {
  const s = db.sessions.find((x) => x.id === sessionId);
  if (!s) throw new UserError(E.sessionNotFound);
  const present = s.presentIds.filter((id) => db.players.some((p) => p.id === id));
  if (present.length < 2) throw new UserError(E.twoPresent);
  const last = s.rounds[s.rounds.length - 1];
  if (last && !sessionRoundComplete(db, last)) throw new UserError(E.finishRoundFirst);

  const byeHistory = new Set(s.rounds.map((r) => r.byePlayerId).filter((x): x is string => !!x));
  const ratingOf = new Map(db.players.map((p) => [p.id, p.rating]));
  const { pairs, byeId } = generatePairings({
    players: present.map((id) => ({ id, score: 0, rating: ratingOf.get(id) ?? 0 })),
    previousPairs: previousPairs(db, { sessionId: s.id }),
    softPairs: s.avoidRematches ? previousPairs(db) : undefined,
    colorStats: colorStats(db),
    byeHistory,
    mode: "random",
  });
  const number = s.rounds.length + 1;
  const pairings = pairs.map((p, i) => {
    const g = makeGame(db, { whiteId: p.whiteId, blackId: p.blackId, rated: s.rated, tournamentId: null, round: null, board: i + 1, sessionId: s.id });
    db.games.push(g);
    return { board: i + 1, whiteId: p.whiteId, blackId: p.blackId, gameId: g.id };
  });
  s.rounds.push({ number, pairings, byePlayerId: byeId, createdAt: new Date().toISOString() });
  log(db, `Club night: round ${number} paired, ${pairings.length} boards${byeId ? `, bye ${nameOf(db, byeId)}` : ""}`);
  return number;
}

export async function sessionStart(fd: FormData) {
  return run(async () => {
    const ids = [...new Set(fd.getAll("playerIds").map(String))];
    if (ids.length < 2) return;
    const E = await msgs();
    const round = await mutate((db) => {
      if (activeSession(db)) throw new UserError(E.nightAlreadyRunning);
      const s = {
        id: newId(),
        createdAt: new Date().toISOString(),
        closedAt: null,
        presentIds: ids,
        rated: fd.get("rated") !== "off",
        avoidRematches: fd.get("avoidRematches") === "on",
        rounds: [],
      };
      db.sessions.push(s);
      log(db, `Club night started with ${ids.length} players${s.rated ? "" : " (unrated)"}`);
      return pairSessionRound(db, s.id, E);
    });
    revalidateAll();
    redirect(`/pairing?reveal=${round}`); // plays the board draw once, see PairingReveal
  });
}

export async function sessionNextRound(id: string) {
  return run(async () => {
    const E = await msgs();
    const round = await mutate((db) => pairSessionRound(db, id, E));
    revalidateAll();
    redirect(`/pairing?reveal=${round}`);
  });
}

/** Regenerates the current round as long as no result has been entered. */
export async function sessionRepair(id: string) {
  return run(async () => {
    const E = await msgs();
    const round = await mutate((db): number | undefined => {
      const s = db.sessions.find((x) => x.id === id);
      if (!s || !s.rounds.length) return;
      const last = s.rounds[s.rounds.length - 1];
      if (roundHasResults(db, last)) throw new UserError(E.roundHasResults);
      const ids = new Set(last.pairings.map((p) => p.gameId));
      db.games = db.games.filter((g) => !ids.has(g.id));
      s.rounds.pop();
      log(db, `Club night: round ${last.number} dissolved for re-pairing`);
      return pairSessionRound(db, s.id, E);
    });
    revalidateAll();
    if (round) redirect(`/pairing?reveal=${round}`);
  });
}

/** Late arrival: joins immediately if someone has a bye, otherwise waits for the next round. */
export async function sessionAddPlayer(id: string, fd: FormData) {
  return run(async () => {
    const playerId = str(fd, "playerId");
    if (!playerId) return;
    await mutate((db) => {
      const s = db.sessions.find((x) => x.id === id);
      if (!s || s.presentIds.includes(playerId)) return;
      s.presentIds.push(playerId);
      log(db, `Club night: ${nameOf(db, playerId)} arrived`);
      const last = s.rounds[s.rounds.length - 1];
      if (last && last.byePlayerId && last.byePlayerId !== playerId) {
        const { whiteId, blackId } = generatePairings({
          players: [
            { id: last.byePlayerId, score: 0, rating: 0 },
            { id: playerId, score: 0, rating: 0 },
          ],
          previousPairs: new Set(),
          colorStats: colorStats(db),
          byeHistory: new Set(),
          mode: "random",
        }).pairs[0];
        const board = last.pairings.length + 1;
        const g = makeGame(db, { whiteId, blackId, rated: s.rated, tournamentId: null, round: null, board, sessionId: s.id });
        db.games.push(g);
        last.pairings.push({ board, whiteId, blackId, gameId: g.id });
        last.byePlayerId = null;
      }
    });
    revalidateAll();
  });
}

/** Someone leaves early: remove from the night; an unplayed board is dissolved and the opponent gets a bye. */
export async function sessionRemovePlayer(id: string, playerId: string) {
  return run(async () => {
    await mutate((db) => {
      const s = db.sessions.find((x) => x.id === id);
      if (!s) return;
      s.presentIds = s.presentIds.filter((p) => p !== playerId);
      log(db, `Club night: ${nameOf(db, playerId)} left`);
      const last = s.rounds[s.rounds.length - 1];
      if (!last) return;
      if (last.byePlayerId === playerId) last.byePlayerId = null;
      const games = new Map(db.games.map((g) => [g.id, g]));
      const pairing = last.pairings.find((p) => p.whiteId === playerId || p.blackId === playerId);
      if (pairing && !games.get(pairing.gameId)?.result) {
        db.games = db.games.filter((g) => g.id !== pairing.gameId);
        last.pairings = last.pairings.filter((p) => p.gameId !== pairing.gameId);
        last.pairings.forEach((p, i) => (p.board = i + 1));
        const opponent = pairing.whiteId === playerId ? pairing.blackId : pairing.whiteId;
        if (!last.byePlayerId) last.byePlayerId = opponent;
      }
    });
    revalidateAll();
  });
}

export async function sessionClose(id: string) {
  return run(async () => {
    await mutate((db) => {
      const s = db.sessions.find((x) => x.id === id);
      if (!s) return;
      // Drop boards that never got a result.
      const pendingIds = new Set(sessionPending(db, s.id));
      db.games = db.games.filter((g) => !pendingIds.has(g.id));
      for (const r of s.rounds) r.pairings = r.pairings.filter((p) => !pendingIds.has(p.gameId));
      s.rounds = s.rounds.filter((r) => r.pairings.length || r.byePlayerId);
      s.closedAt = new Date().toISOString();
      log(db, `Club night closed after ${s.rounds.length} rounds${pendingIds.size ? `, ${pendingIds.size} unplayed boards dropped` : ""}`);
      recomputeRatings(db);
    });
    revalidateAll();
  });
}

function sessionPending(db: Database, sessionId: string): string[] {
  return db.games.filter((g) => g.sessionId === sessionId && g.result === null).map((g) => g.id);
}

export async function sessionDelete(id: string) {
  return run(async () => {
    await requireAdmin();
    await mutate((db) => {
      log(db, `Club night of ${db.sessions.find((s) => s.id === id)?.createdAt.slice(0, 10) ?? "?"} deleted`);
      db.sessions = db.sessions.filter((s) => s.id !== id);
      db.games = db.games.filter((g) => g.sessionId !== id);
      recomputeRatings(db);
    });
    revalidateAll();
    redirect("/pairing");
  });
}

export async function sessionDeleteLastRound(id: string) {
  return run(async () => {
    await requireAdmin();
    await mutate((db) => {
      const s = db.sessions.find((x) => x.id === id);
      if (!s || !s.rounds.length) return;
      const last = s.rounds.pop()!;
      log(db, `Club night: round ${last.number} deleted`);
      const ids = new Set(last.pairings.map((p) => p.gameId));
      db.games = db.games.filter((g) => !ids.has(g.id));
      recomputeRatings(db);
    });
    revalidateAll();
  });
}

/* ------------------------------------------------------------------ */
/* Knockout helpers                                                    */
/* ------------------------------------------------------------------ */
