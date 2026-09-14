"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { AsyncLocalStorage } from "node:async_hooks";
import { migrate, mutate, newId, nextSeq, readBackup, readDb, replaceDb } from "./db";
import { RESULTS, recomputeRatings } from "./elo";
import { assignColors, bracketSeedOrder, generatePairings, nextPowerOfTwo, roundRobinSchedule, shuffle } from "./pairing";
import {
  activeParticipants,
  activeSession,
  colorStats,
  knockoutRounds,
  matchState,
  previousPairs,
  resultLabel,
  roundComplete,
  roundHasResults,
  roundRobinRounds,
  sessionRoundComplete,
  standings,
  TIEBREAK_PRESETS,
} from "./queries";
import { adminConfigured, clearMeCookie, clearSessionCookie, currentPlayerId, hashPassword, isAdmin, requireAdmin, setMeCookie, setMemberCookie, setSessionCookie, verifyPassword } from "./auth";
import { UserError } from "./errors";
import { isAvatar, randomAvatar } from "./avatar";
import { clearPinFails, PIN_RE, pinLocked, registerPinFail } from "./pin";
import { SKIP_COOKIE, SKIP_DAYS } from "./tokens";
import { currentSeason, seasonTable } from "./club";
import type { Database, Game, GameResult, KnockoutMatch, PairingMode, TiebreakKey, Tournament } from "./types";

function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function num(fd: FormData, key: string, fallback: number): number {
  const n = Number(str(fd, key));
  return Number.isFinite(n) && str(fd, key) !== "" ? n : fallback;
}

function parseResult(value: string): GameResult {
  if (!RESULTS.includes(value as GameResult)) throw new UserError(`Invalid result: ${value}`);
  return value as GameResult;
}

function revalidateAll() {
  revalidatePath("/", "layout");
}

/* ------------------------------------------------------------------ */
/* Action plumbing: user-facing errors, activity log                   */
/* ------------------------------------------------------------------ */

const actor = new AsyncLocalStorage<{ admin: boolean }>();

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
  db.activity.push({ id: newId(), at: new Date().toISOString(), admin: actor.getStore()?.admin ?? false, text });
  if (db.activity.length > LOG_KEEP) db.activity.splice(0, db.activity.length - LOG_KEEP);
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
function playedAt(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date === localToday()) return new Date().toISOString();
  if (date > localToday()) throw new UserError("The game date cannot be in the future.");
  return new Date(`${date}T12:00:00`).toISOString();
}

function parseMode(raw: string): PairingMode {
  return raw === "swiss" || raw === "roundrobin" || raw === "knockout" ? raw : "random";
}

function tiebreaksFrom(fd: FormData, fallback: TiebreakKey[]): TiebreakKey[] {
  const preset = TIEBREAK_PRESETS.find((p) => p.key === str(fd, "tiebreaks"));
  return preset ? [...preset.order] : fallback;
}

function makeGame(db: Database, fields: Pick<Game, "whiteId" | "blackId" | "rated" | "tournamentId" | "round" | "board" | "sessionId">): Game {
  return {
    id: newId(),
    seq: nextSeq(db),
    result: null,
    createdAt: new Date().toISOString(),
    completedAt: null,
    whiteRatingBefore: null,
    blackRatingBefore: null,
    whiteRatingAfter: null,
    blackRatingAfter: null,
    ...fields,
  };
}

/* ------------------------------------------------------------------ */
/* Admin, settings, backups                                            */
/* ------------------------------------------------------------------ */

export async function setupAdmin(fd: FormData) {
  return run(async () => {
    if (await adminConfigured()) throw new UserError("Admin password is already set.");
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
    const hash = (await readDb()).settings.adminPasswordHash;
    if (!hash || !verifyPassword(str(fd, "password"), hash)) redirect("/admin?error=wrong");
    await setSessionCookie();
    await mutate((db) => log(db, "Admin signed in"));
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
    await requireAdmin();
    const hash = (await readDb()).settings.adminPasswordHash;
    if (!hash || !verifyPassword(str(fd, "current"), hash)) redirect("/admin?error=wrong");
    const pw = str(fd, "password");
    if (pw.length < 4) redirect("/admin?error=short");
    if (pw !== str(fd, "confirm")) redirect("/admin?error=mismatch");
    await mutate((db) => {
      db.settings.adminPasswordHash = hashPassword(pw);
      log(db, "Admin password changed");
    });
    redirect("/admin?ok=changed");
  });
}

export async function updateSettings(fd: FormData) {
  return run(async () => {
    await requireAdmin();
    await mutate((db) => {
      db.settings.startRating = Math.round(num(fd, "startRating", db.settings.startRating));
      db.settings.byePoints = str(fd, "byePoints") === "0.5" ? 0.5 : 1;
      db.settings.defaultTiebreaks = tiebreaksFrom(fd, db.settings.defaultTiebreaks);
      log(db, `Settings changed: start Elo ${db.settings.startRating}, bye ${db.settings.byePoints}, tiebreaks ${db.settings.defaultTiebreaks.join("/")}`);
    });
    revalidateAll();
    redirect("/admin?ok=saved");
  });
}

/** Replaces the database with an uploaded JSON file. The current state is kept as a snapshot first. */
export async function importDatabase(fd: FormData) {
  return run(async () => {
    await requireAdmin();
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
    // Keep the admin credentials of this installation.
    next.settings.adminPasswordHash = current.settings.adminPasswordHash;
    next.settings.sessionSecret = current.settings.sessionSecret;
    recomputeRatings(next);
    log(next, `Database imported from "${file.name}" (${next.players.length} players, ${next.games.length} games)`);
    await replaceDb(next, "before-import");
    revalidateAll();
    redirect("/admin?ok=imported");
  });
}

export async function restoreBackup(file: string) {
  return run(async () => {
    await requireAdmin();
    if (!/^db-[\w-]+\.json$/.test(file)) throw new UserError("Invalid backup name.");
    const next = await readBackup(file);
    if (!next) throw new UserError("Backup not found.");
    const current = await readDb();
    next.settings.adminPasswordHash = current.settings.adminPasswordHash;
    next.settings.sessionSecret = current.settings.sessionSecret;
    recomputeRatings(next);
    log(next, `Snapshot ${file} restored`);
    await replaceDb(next, "before-restore");
    revalidateAll();
    redirect("/admin?ok=restored");
  });
}

export async function updateClub(fd: FormData) {
  return run(async () => {
    await requireAdmin();
    await mutate((db) => {
      const c = db.settings.club;
      c.name = str(fd, "name") || c.name;
      c.motto = str(fd, "motto");
      c.founded = str(fd, "founded");
      c.meets = str(fd, "meets");
      const next = str(fd, "nextNight");
      if (next && !/^\d{4}-\d{2}-\d{2}$/.test(next)) throw new UserError("The next club night needs a date.");
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
    await requireAdmin();
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
export async function clearMemberCode() {
  return run(async () => {
    await requireAdmin();
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
    if (!verifyPassword(str(fd, "code"), hash)) redirect(`/join?error=wrong&next=${encodeURIComponent(next)}`);
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
    await mutate((db) => {
      if (currentSeason(db)) throw new UserError("Close the current season before starting a new one.");
      const start = str(fd, "start") || localToday();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) throw new UserError("The season needs a start date.");
      const lastEnd = db.seasons.map((s) => s.end ?? "").sort().at(-1) ?? "";
      if (lastEnd && start <= lastEnd) throw new UserError(`The new season must start after ${lastEnd}, when the previous one ended.`);
      const name = str(fd, "name") || `Season ${start.slice(0, 4)}`;
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
    await mutate((db) => {
      const s = db.seasons.find((x) => x.id === id);
      if (!s) return;
      if (s.end) throw new UserError("This season is already closed.");
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
    await mutate((db) => {
      const s = db.seasons.find((x) => x.id === id);
      if (!s) return;
      if (currentSeason(db)) throw new UserError("Another season is running. Close it first.");
      const later = db.seasons.some((x) => x.id !== id && x.start > s.start);
      if (later) throw new UserError("Only the most recent season can be reopened.");
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
    await mutate((db) => {
      const s = db.seasons.find((x) => x.id === id);
      if (!s) return;
      const name = str(fd, "name");
      if (!name) throw new UserError("A season needs a name.");
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
    await mutate((db) => {
      if (db.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) throw new UserError(`A player named "${name}" already exists.`);
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
    if (!(await isAdmin()) && (await currentPlayerId()) !== id) {
      throw new UserError("Only this player can change their avatar. Open your own profile and click “This is me” first.");
    }
    if (!isAvatar(seed)) throw new UserError("That avatar is not valid.");
    await mutate((db) => {
      const p = db.players.find((x) => x.id === id);
      if (!p) throw new UserError("Player not found.");
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
    if (await currentPlayerId()) throw new UserError("This device already belongs to a player. Use “Not me” on that profile first.");
    const name = str(fd, "name");
    if (name.length < 2) throw new UserError("Please enter your name.");
    const pin = str(fd, "pin");
    if (!PIN_RE.test(pin)) throw new UserError("A PIN is exactly 4 digits.");
    if (pin !== str(fd, "confirm")) throw new UserError("The two PINs do not match.");
    const id = newId();
    await mutate((db) => {
      if (db.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
        throw new UserError(`“${name}” is already on the list. If that is you, pick your face under “Who are you?”.`);
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
    redirect(noticeUrl(`/players/${id}`, `Welcome to the club, ${name}. Pick a face you like by clicking your avatar.`));
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
    const db = await readDb();
    const p = db.players.find((x) => x.id === id);
    if (!p) throw new UserError("Player not found.");
    if (!PIN_RE.test(pin)) back("short");
    if (!p.pinHash) {
      if (pin !== str(fd, "confirm")) back("mismatch");
      await mutate((d) => {
        const q = d.players.find((x) => x.id === id)!;
        if (q.pinHash) throw new UserError("A PIN was set for this player a moment ago. Enter it instead.");
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
    redirect(noticeUrl(next || `/players/${id}`, `Welcome back, ${p.name}. This device now knows you.`));
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
    if ((await currentPlayerId()) !== id) throw new UserError("Only this player can change their PIN.");
    const current = str(fd, "current");
    const pin = str(fd, "pin");
    if (!PIN_RE.test(pin)) throw new UserError("The new PIN must be exactly 4 digits.");
    if (pin !== str(fd, "confirm")) throw new UserError("The two new PINs do not match.");
    const db = await readDb();
    const p = db.players.find((x) => x.id === id);
    if (!p) throw new UserError("Player not found.");
    if (p.pinHash && !verifyPassword(current, p.pinHash)) throw new UserError("The current PIN is wrong.");
    await mutate((d) => {
      const q = d.players.find((x) => x.id === id)!;
      q.pinHash = hashPassword(pin);
      clearPinFails(q);
      log(d, `${q.name} changed their PIN`);
    });
    revalidateAll();
    redirect(noticeUrl(`/players/${id}`, "PIN changed."));
  });
}

/** Admin sets a new PIN for someone who forgot theirs, or clears it so they choose one on their next claim. */
export async function resetPin(id: string, fd: FormData) {
  return run(async () => {
    await requireAdmin();
    const pin = str(fd, "pin");
    if (pin && !PIN_RE.test(pin)) throw new UserError("A PIN is exactly 4 digits. Leave it empty to let the player choose one.");
    await mutate((d) => {
      const q = d.players.find((x) => x.id === id);
      if (!q) throw new UserError("Player not found.");
      if (pin) q.pinHash = hashPassword(pin);
      else delete q.pinHash;
      clearPinFails(q);
      log(d, pin ? `Admin set a new PIN for ${q.name}` : `Admin cleared the PIN of ${q.name}; they choose a new one on their next claim`);
    });
    revalidateAll();
    redirect(noticeUrl(`/players/${id}`, pin ? "New PIN set. Tell the player in person." : "PIN cleared. The player sets a new one the next time they say “This is me”."));
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
    const whiteId = str(fd, "whiteId");
    const blackId = str(fd, "blackId");
    const result = parseResult(str(fd, "result"));
    if (!whiteId || !blackId || whiteId === blackId) return;
    await mutate((db) => {
      const g = makeGame(db, { whiteId, blackId, rated: fd.get("rated") !== "off", tournamentId: null, round: null, board: null, sessionId: null });
      g.result = result;
      const when = playedAt(str(fd, "date"));
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
    if (result !== null) parseResult(result);
    await mutate((db) => {
      const g = db.games.find((x) => x.id === gameId);
      if (!g) return;
      const t = g.tournamentId ? db.tournaments.find((x) => x.id === g.tournamentId) : undefined;
      if (t?.knockout && g.round !== null && g.round < t.rounds.length) {
        throw new UserError("This knockout round is locked because the next round has already been drawn. Delete the later round first.");
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
    await mutate((db) => {
      const g = db.games.find((x) => x.id === gameId);
      if (!g) return;
      if (g.result) throw new UserError("Clear the result before swapping colors.");
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
    await mutate((db) => {
      const g = db.games.find((x) => x.id === gameId);
      if (!g) return;
      if (g.tournamentId) throw new UserError("Tournament games are removed by deleting the round.");
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
    await mutate((db) => {
      const t = db.tournaments.find((x) => x.id === id);
      if (!t) return;
      if ((t.pairingMode === "roundrobin" || t.pairingMode === "knockout") && t.rounds.length) throw new UserError("The field is fixed once this format has started.");
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
    await mutate((db) => {
      const t = db.tournaments.find((x) => x.id === id);
      if (!t) return;
      if (t.status === "finished") throw new UserError("Tournament is finished.");
      const last = t.rounds[t.rounds.length - 1];
      if (last && !roundComplete(db, t, last.number)) throw new UserError("Enter all results of the current round first.");
      if (t.rounds.length >= t.plannedRounds) throw new UserError("All planned rounds have been played. Increase the round count to continue.");
      const roundNumber = t.rounds.length + 1;
      log(db, `Tournament "${t.name}": round ${roundNumber} drawn`);

      let pairs: { whiteId: string; blackId: string; forfeitGameId?: string }[];
      let byeId: string | null;

      if (t.pairingMode === "knockout") {
        generateKnockoutRound(db, t);
        t.status = "running";
        recomputeRatings(db);
        return;
      }

      if (t.pairingMode === "roundrobin") {
        if (t.participantIds.length < 2) throw new UserError("At least two participants are needed.");
        if (!t.rrOrder || !t.rounds.length) t.rrOrder = shuffle(t.participantIds);
        const schedule = roundRobinSchedule(t.rrOrder);
        const r = schedule[roundNumber - 1];
        if (!r) throw new UserError("Round robin schedule is complete.");
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
        if (active.length < 2) throw new UserError("At least two active participants are needed.");
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
    });
    revalidateAll();
  });
}

/** Manually rewrite the boards of a round that has no results yet. */
export async function updateRoundPairings(id: string, roundNumber: number, fd: FormData) {
  return run(async () => {
    await mutate((db) => {
      const t = db.tournaments.find((x) => x.id === id);
      if (!t) return;
      const round = t.rounds.find((r) => r.number === roundNumber);
      if (!round) return;
      if (t.pairingMode === "knockout") throw new UserError("Knockout brackets cannot be edited by hand.");
      if (roundHasResults(db, round)) throw new UserError("This round already has results. Clear them before editing pairings.");

      const seen = new Set<string>();
      const use = (pid: string) => {
        if (!pid) return;
        if (seen.has(pid)) throw new UserError("A player appears on two boards.");
        seen.add(pid);
      };
      const newPairs: { whiteId: string; blackId: string }[] = [];
      for (let i = 0; i < round.pairings.length; i++) {
        const w = str(fd, `white_${i}`);
        const b = str(fd, `black_${i}`);
        if (!w && !b) continue;
        if (!w || !b) throw new UserError(`Board ${i + 1} needs two players.`);
        if (w === b) throw new UserError(`Board ${i + 1} has the same player twice.`);
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

function pairSessionRound(db: Database, sessionId: string) {
  const s = db.sessions.find((x) => x.id === sessionId);
  if (!s) throw new UserError("Session not found.");
  const present = s.presentIds.filter((id) => db.players.some((p) => p.id === id));
  if (present.length < 2) throw new UserError("At least two players must be present.");
  const last = s.rounds[s.rounds.length - 1];
  if (last && !sessionRoundComplete(db, last)) throw new UserError("Finish the current round first.");

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
}

export async function sessionStart(fd: FormData) {
  return run(async () => {
    const ids = [...new Set(fd.getAll("playerIds").map(String))];
    if (ids.length < 2) return;
    await mutate((db) => {
      if (activeSession(db)) throw new UserError("A club night is already running. Close it first.");
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
      pairSessionRound(db, s.id);
    });
    revalidateAll();
  });
}

export async function sessionNextRound(id: string) {
  return run(async () => {
    await mutate((db) => pairSessionRound(db, id));
    revalidateAll();
  });
}

/** Regenerates the current round as long as no result has been entered. */
export async function sessionRepair(id: string) {
  return run(async () => {
    await mutate((db) => {
      const s = db.sessions.find((x) => x.id === id);
      if (!s || !s.rounds.length) return;
      const last = s.rounds[s.rounds.length - 1];
      if (roundHasResults(db, last)) throw new UserError("This round already has results.");
      const ids = new Set(last.pairings.map((p) => p.gameId));
      db.games = db.games.filter((g) => !ids.has(g.id));
      s.rounds.pop();
      log(db, `Club night: round ${last.number} dissolved for re-pairing`);
      pairSessionRound(db, s.id);
    });
    revalidateAll();
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

function addMatchGame(db: Database, t: Tournament, m: KnockoutMatch, round: Tournament["rounds"][number]) {
  if (!m.a || !m.b) return;
  // Alternate colors game by game; the first game is balanced on history.
  const games = new Map(db.games.map((g) => [g.id, g]));
  const lastGame = m.gameIds.length ? games.get(m.gameIds[m.gameIds.length - 1]) : undefined;
  const colors = lastGame
    ? { whiteId: lastGame.blackId, blackId: lastGame.whiteId }
    : assignColors(m.a, m.b, colorStats(db, { tournamentId: t.id }));
  const board = round.pairings.length + 1;
  const g = makeGame(db, { ...colors, rated: t.rated, tournamentId: t.id, round: m.round, board, sessionId: null });
  db.games.push(g);
  m.gameIds.push(g.id);
  round.pairings.push({ board, whiteId: g.whiteId, blackId: g.blackId, gameId: g.id });
}

/** Keeps every match consistent with its games: adds tiebreak games on ties, removes stale ones, sets winners. */
function syncKnockout(db: Database, t: Tournament) {
  const ko = t.knockout;
  if (!ko) return;
  const games = new Map(db.games.map((g) => [g.id, g]));
  for (const m of ko.matches) {
    const round = t.rounds.find((r) => r.number === m.round);
    if (!round) continue;
    if (!m.a || !m.b) {
      m.winnerId = m.a ?? m.b;
      continue;
    }
    const base = ko.gamesPerMatch;
    const baseUnplayed = m.gameIds.slice(0, base).some((id) => !games.get(id)?.result);
    // Drop unplayed extra games that are no longer justified.
    const keep: string[] = [];
    let removed = false;
    m.gameIds.forEach((id, i) => {
      const g = games.get(id);
      if (!g) return;
      const isExtra = i >= base;
      const lastUnplayedExtra = isExtra && !g.result && i === m.gameIds.length - 1;
      if (isExtra && !g.result && (baseUnplayed || !lastUnplayedExtra)) {
        db.games = db.games.filter((x) => x.id !== id);
        round.pairings = round.pairings.filter((p) => p.gameId !== id);
        removed = true;
        return;
      }
      keep.push(id);
    });
    if (removed) m.gameIds = keep;

    const st = matchState(db, m);
    if (st.pending > 0) {
      m.winnerId = null;
      continue;
    }
    if (st.scoreA === st.scoreB) {
      m.winnerId = null;
      addMatchGame(db, t, m, round); // tiebreak, colors swapped
    } else {
      m.winnerId = st.scoreA > st.scoreB ? m.a : m.b;
    }
  }
}

function generateKnockoutRound(db: Database, t: Tournament) {
  const ko = t.knockout!;
  const total = knockoutRounds(t);
  const roundNumber = t.rounds.length + 1;
  if (roundNumber > total) throw new UserError("The bracket is complete.");
  const withdrawn = new Set(t.withdrawnIds);
  const round = { number: roundNumber, pairings: [], byePlayerId: null, createdAt: new Date().toISOString() };
  const newMatches: KnockoutMatch[] = [];

  if (roundNumber === 1) {
    if (t.participantIds.length < 2) throw new UserError("At least two participants are needed.");
    const players = playerMapRatings(db);
    const seeds = activeParticipants(t).sort((x, y) => (players.get(y) ?? 0) - (players.get(x) ?? 0));
    ko.bracketSize = nextPowerOfTwo(seeds.length);
    ko.matches = [];
    const order = bracketSeedOrder(ko.bracketSize);
    for (let i = 0; i < order.length; i += 2) {
      const sa = order[i];
      const sb = order[i + 1];
      const a = seeds[sa - 1] ?? null;
      const b = seeds[sb - 1] ?? null;
      newMatches.push({ id: newId(), round: 1, slot: i / 2 + 1, a, b, seedA: a ? sa : null, seedB: b ? sb : null, gameIds: [], winnerId: a && b ? null : (a ?? b), thirdPlace: false });
    }
  } else {
    const prev = ko.matches.filter((m) => m.round === roundNumber - 1 && !m.thirdPlace).sort((x, y) => x.slot - y.slot);
    // Withdrawn players hand the match to their opponent.
    for (const m of prev) {
      if (m.winnerId) continue;
      const aOut = !!m.a && withdrawn.has(m.a);
      const bOut = !!m.b && withdrawn.has(m.b);
      if (aOut !== bOut) m.winnerId = aOut ? m.b : m.a;
    }
    if (prev.some((m) => !m.winnerId)) throw new UserError("Every match of the current round needs a winner first (ties get an automatic tiebreak game).");
    const seedOf = (id: string | null) => {
      const m = ko.matches.find((x) => x.round === 1 && (x.a === id || x.b === id));
      return m ? (m.a === id ? m.seedA : m.seedB) : null;
    };
    for (let i = 0; i < prev.length; i += 2) {
      const a = prev[i].winnerId;
      const b = prev[i + 1]?.winnerId ?? null;
      newMatches.push({ id: newId(), round: roundNumber, slot: i / 2 + 1, a, b, seedA: seedOf(a), seedB: seedOf(b), gameIds: [], winnerId: a && b ? null : (a ?? b), thirdPlace: false });
    }
    if (roundNumber === total && ko.thirdPlace && prev.length === 2) {
      const la = prev[0].winnerId === prev[0].a ? prev[0].b : prev[0].a;
      const lb = prev[1].winnerId === prev[1].a ? prev[1].b : prev[1].a;
      if (la && lb) newMatches.push({ id: newId(), round: roundNumber, slot: 2, a: la, b: lb, seedA: seedOf(la), seedB: seedOf(lb), gameIds: [], winnerId: null, thirdPlace: true });
    }
  }

  ko.matches.push(...newMatches);
  t.rounds.push(round);
  for (const m of newMatches) {
    if (!m.a || !m.b) continue;
    for (let i = 0; i < ko.gamesPerMatch; i++) addMatchGame(db, t, m, round);
  }
}

function playerMapRatings(db: Database): Map<string, number> {
  return new Map(db.players.map((p) => [p.id, p.rating]));
}
