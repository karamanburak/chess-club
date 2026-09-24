import fs from "node:fs";
import { dayOf, localDay } from "./time";
import path from "node:path";
import { cache } from "react";
import { pickAvatar } from "./avatar";
import type { ClubInfo, Database, TiebreakKey } from "./types";

/**
 * Storage lives behind one small interface. Without DATABASE_URL the club is a
 * JSON file next to the code (local use, tests). With DATABASE_URL it is one
 * jsonb row in Postgres (Neon on Vercel), guarded by a version number so two
 * phones entering results at the same time cannot overwrite each other.
 */

/** Override with CHESS_DATA_DIR to run against a different data folder (tests, a second club). */
export const DATA_DIR = process.env.CHESS_DATA_DIR ? path.resolve(process.env.CHESS_DATA_DIR) : path.join(process.cwd(), "data");
export const DB_PATH = path.join(DATA_DIR, "db.json");
export const BACKUP_DIR = path.join(DATA_DIR, "backups");
const KEEP_BACKUPS = 30;

export const DEFAULT_TIEBREAKS: TiebreakKey[] = ["buchholz", "sonneborn", "direct", "wins"];

export const DEFAULT_CLUB: ClubInfo = { name: "Chess Club", meets: "", nextNight: "", announcement: "" };

function emptyDb(): Database {
  return {
    version: 2,
    seq: 0,
    players: [],
    games: [],
    tournaments: [],
    sessions: [],
    seasons: [],
    challenges: [],
    activity: [],
    settings: { startRating: 1200, byePoints: 1, defaultTiebreaks: DEFAULT_TIEBREAKS, club: { ...DEFAULT_CLUB } },
  };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Brings older files up to the current shape. Safe to run on every read. */
export function migrate(raw: any): Database {
  const db: any = { ...emptyDb(), ...raw };
  db.settings = { ...emptyDb().settings, ...(raw?.settings ?? {}) };
  db.settings.club = { ...DEFAULT_CLUB, ...(raw?.settings?.club ?? {}) };
  if (db.settings.language !== "de") db.settings.language = "en";
  delete db.settings.club.motto; // replaced by the quote of the day
  delete db.settings.club.founded; // removed field
  delete db.settings.memberNotifyOff; // members' own ntfy topics gave way to the club's Slack channel
  db.version = 2;

  for (const g of db.games) {
    if (g.sessionId === undefined) g.sessionId = null;
  }
  for (const p of db.players ?? []) delete p.notifyTopic; // see memberNotifyOff above
  for (const t of db.tournaments) {
    t.timeControl ??= "";
    t.tiebreaks ??= [...db.settings.defaultTiebreaks];
    t.byePoints ??= db.settings.byePoints;
    t.withdrawnIds ??= [];
  }
  db.sessions ??= [];
  db.activity ??= [];
  db.seasons ??= [];
  db.challenges ??= [];
  for (const c of db.challenges) {
    c.whiteId ??= null;
    c.rated ??= true; // challenges before the rated/unrated choice all counted for Elo
    if (c.session && c.timeControl) c.timeControl = ""; // sessions sent before they dropped the time control
  }
  // Every club lives in a season. The first one opens at the first game (or today) and is named after that year.
  if (db.seasons.length === 0) {
    const first = db.games
      .map((g: any) => g.completedAt as string | null)
      .filter((x: string | null): x is string => !!x)
      .sort()[0];
    const start = first ? dayOf(first) : localDay();
    db.seasons.push({ id: `season-${start}`, name: `Season ${start.slice(0, 4)}`, start, end: null, championId: null });
  }
  // Faces for players created before avatars existed: seeded by id, so every read agrees.
  for (const p of db.players) p.avatar ||= pickAvatar(p.id);
  // v1 had a single quickSession; turn it into a club night with one round.
  if (db.quickSession) {
    const qs = db.quickSession;
    const present = new Set<string>();
    for (const p of qs.pairings) {
      present.add(p.whiteId);
      present.add(p.blackId);
    }
    if (qs.byePlayerId) present.add(qs.byePlayerId);
    const id = crypto.randomUUID();
    db.sessions.push({
      id,
      createdAt: qs.createdAt,
      closedAt: null,
      presentIds: [...present],
      rated: true,
      avoidRematches: true,
      rounds: [
        {
          number: 1,
          pairings: qs.pairings.map((p: any, i: number) => ({ board: i + 1, whiteId: p.whiteId, blackId: p.blackId, gameId: p.gameId })),
          byePlayerId: qs.byePlayerId ?? null,
          createdAt: qs.createdAt,
        },
      ],
    });
    const ids = new Set(qs.pairings.map((p: any) => p.gameId));
    for (const g of db.games) if (ids.has(g.id)) g.sessionId = id;
    delete db.quickSession;
  }
  return db as Database;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/* ------------------------------------------------------------------ */
/* Storage interface                                                   */
/* ------------------------------------------------------------------ */

export interface BackupInfo {
  file: string;
  size: number;
  date: string;
}

interface Storage {
  load(): Promise<{ db: Database; version: number }>;
  /** Returns false when someone else saved in between (Postgres); the caller retries. */
  save(db: Database, expectedVersion: number): Promise<boolean>;
  listBackups(): Promise<BackupInfo[]>;
  readBackup(file: string): Promise<Database | null>;
  /** Copies the current state aside under `db-<label>-<timestamp>.json`. Returns the file name. */
  snapshot(label: string): Promise<string | null>;
  deleteBackup(file: string): Promise<boolean>;
}

/** Snapshot files: `db-<label>-<stamp>.json`. Restore, download and delete accept nothing else. */
export const BACKUP_NAME_RE = /^db-[\w-]+\.json$/;

/** Turns a free-text label into something that fits the file name: letters, digits and dashes, at most 40 chars. */
export function snapshotLabel(raw: string, fallback = "manual"): string {
  const s = raw
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return s || fallback;
}

function todayName(): string {
  return `db-${localDay()}.json`;
}

/** The automatic one-per-day snapshots; everything else was taken on purpose (by hand, before a reset/import/restore). */
const DAILY_RE = /^db-\d{4}-\d{2}-\d{2}\.json$/;

function stampedName(label: string): string {
  return `db-${label}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
}

/* ---------------------------- JSON file ---------------------------- */

/**
 * Removes the oldest snapshots so at most `keep` daily ones and `keep` deliberate ones remain. Counted apart, so a
 * month of daily copies never pushes out the snapshot taken before a reset.
 */
export function pruneBackups(keep = KEEP_BACKUPS): string[] {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  const files = fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => /^db-[\w-]+\.json$/.test(f))
    .map((f) => ({ f, mtime: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
    .sort((a, b) => a.mtime - b.mtime);
  const oldest = (list: typeof files) => list.slice(0, Math.max(0, list.length - keep)).map((x) => x.f);
  const removed = [...oldest(files.filter((x) => DAILY_RE.test(x.f))), ...oldest(files.filter((x) => !DAILY_RE.test(x.f)))];
  for (const f of removed) fs.unlinkSync(path.join(BACKUP_DIR, f));
  return removed;
}

const fileStorage: Storage = {
  async load() {
    try {
      return { db: migrate(JSON.parse(fs.readFileSync(DB_PATH, "utf8"))), version: 0 };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        const db = emptyDb();
        await this.save(db, 0);
        return { db, version: 0 };
      }
      throw err;
    }
  },
  async save(db) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    // One snapshot per day, taken before the first change of the day.
    if (fs.existsSync(DB_PATH)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
      const target = path.join(BACKUP_DIR, todayName());
      if (!fs.existsSync(target)) {
        fs.copyFileSync(DB_PATH, target);
        pruneBackups();
      }
    }
    const tmp = DB_PATH + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2), "utf8");
    fs.renameSync(tmp, DB_PATH);
    return true;
  },
  async listBackups() {
    if (!fs.existsSync(BACKUP_DIR)) return [];
    return fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => f.endsWith(".json"))
      .sort()
      .reverse()
      .map((f) => {
        const st = fs.statSync(path.join(BACKUP_DIR, f));
        return { file: f, size: st.size, date: st.mtime.toISOString() };
      });
  },
  async readBackup(file) {
    const src = path.join(BACKUP_DIR, file);
    if (!fs.existsSync(src)) return null;
    return migrate(JSON.parse(fs.readFileSync(src, "utf8")));
  },
  async snapshot(label) {
    if (!fs.existsSync(DB_PATH)) return null;
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const name = stampedName(label);
    fs.copyFileSync(DB_PATH, path.join(BACKUP_DIR, name));
    pruneBackups();
    return name;
  },
  async deleteBackup(file) {
    const target = path.join(BACKUP_DIR, file);
    if (!fs.existsSync(target)) return false;
    fs.unlinkSync(target);
    return true;
  },
};

/* ----------------------------- Postgres ---------------------------- */

type Sql = ReturnType<typeof import("@neondatabase/serverless").neon>;
let sqlClient: Sql | null = null;
let schemaReady: Promise<void> | null = null;

async function sql(): Promise<Sql> {
  if (!sqlClient) {
    const { neon } = await import("@neondatabase/serverless");
    sqlClient = neon(process.env.DATABASE_URL!);
  }
  if (!schemaReady) {
    const q = sqlClient;
    schemaReady = (async () => {
      await q`CREATE TABLE IF NOT EXISTS club_state (id int PRIMARY KEY, version int NOT NULL DEFAULT 0, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`;
      await q`CREATE TABLE IF NOT EXISTS club_snapshots (name text PRIMARY KEY, data jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`;
    })();
    // A failed setup (network blip on a cold start) must not stick for the life of the instance: try again next time.
    schemaReady.catch(() => {
      schemaReady = null;
    });
  }
  await schemaReady;
  return sqlClient;
}

/** The day this instance last made sure the daily snapshot exists. */
let dailyDoneFor = "";

const postgresStorage: Storage = {
  async load() {
    const q = await sql();
    const rows = (await q`SELECT version, data FROM club_state WHERE id = 1`) as { version: number; data: unknown }[];
    if (rows.length) return { db: migrate(rows[0].data), version: rows[0].version };
    const db = emptyDb();
    await q`INSERT INTO club_state (id, version, data) VALUES (1, 0, ${JSON.stringify(db)}::jsonb) ON CONFLICT (id) DO NOTHING`;
    return this.load();
  },
  async save(db, expectedVersion) {
    const q = await sql();
    const json = JSON.stringify(db);
    // One snapshot per day of the state before the day's first change, copied server-side (as the file backend does).
    // Once this instance has done it for today, the save is a single round trip.
    const day = todayName();
    if (dailyDoneFor !== day) {
      const inserted = (await q`INSERT INTO club_snapshots (name, data) SELECT ${day}, data FROM club_state WHERE id = 1 ON CONFLICT (name) DO NOTHING RETURNING name`) as unknown[];
      if (inserted.length) {
        await q`DELETE FROM club_snapshots WHERE name ~ '^db-[0-9]{4}-[0-9]{2}-[0-9]{2}[.]json$' AND name NOT IN (SELECT name FROM club_snapshots WHERE name ~ '^db-[0-9]{4}-[0-9]{2}-[0-9]{2}[.]json$' ORDER BY created_at DESC LIMIT ${KEEP_BACKUPS})`;
      }
      dailyDoneFor = day;
    }
    const updated = (await q`UPDATE club_state SET data = ${json}::jsonb, version = version + 1, updated_at = now() WHERE id = 1 AND version = ${expectedVersion} RETURNING version`) as unknown[];
    return updated.length > 0;
  },
  async listBackups() {
    const q = await sql();
    const rows = (await q`SELECT name, length(data::text) AS size, created_at FROM club_snapshots ORDER BY created_at DESC`) as { name: string; size: number; created_at: string }[];
    return rows.map((r) => ({ file: r.name, size: Number(r.size), date: new Date(r.created_at).toISOString() }));
  },
  async readBackup(file) {
    const q = await sql();
    const rows = (await q`SELECT data FROM club_snapshots WHERE name = ${file}`) as { data: unknown }[];
    return rows.length ? migrate(rows[0].data) : null;
  },
  async snapshot(label) {
    const q = await sql();
    const name = stampedName(label);
    const rows = (await q`INSERT INTO club_snapshots (name, data) SELECT ${name}, data FROM club_state WHERE id = 1 RETURNING name`) as unknown[];
    await q`DELETE FROM club_snapshots WHERE name !~ '^db-[0-9]{4}-[0-9]{2}-[0-9]{2}[.]json$' AND name NOT IN (SELECT name FROM club_snapshots WHERE name !~ '^db-[0-9]{4}-[0-9]{2}-[0-9]{2}[.]json$' ORDER BY created_at DESC LIMIT ${KEEP_BACKUPS})`;
    return rows.length ? name : null;
  },
  async deleteBackup(file) {
    const q = await sql();
    const rows = (await q`DELETE FROM club_snapshots WHERE name = ${file} RETURNING name`) as unknown[];
    return rows.length > 0;
  },
};

export const STORAGE_KIND: "file" | "postgres" = process.env.DATABASE_URL ? "postgres" : "file";
if (STORAGE_KIND === "file" && process.env.VERCEL) {
  throw new Error("Running on Vercel without DATABASE_URL: the filesystem is read-only there. Add a Neon (or any Postgres) database and set DATABASE_URL.");
}
const storage: Storage = STORAGE_KIND === "postgres" ? postgresStorage : fileStorage;

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/** Current state. Cached per request, so a page and its components share one read. */
export const readDb = cache(async (): Promise<Database> => (await storage.load()).db);

let chain: Promise<unknown> = Promise.resolve();

/**
 * The state objects that actually reached storage. mutate() reruns its callback on a version conflict with a fresh
 * copy, so side effects queued by an attempt that lost (phone notifications) must check this before going out.
 */
const persisted = new WeakSet<Database>();

export function wasPersisted(db: Database): boolean {
  return persisted.has(db);
}

/**
 * Read, change, persist. Mutations in one process run strictly one after another;
 * across processes (several Vercel functions) the version check catches races and retries.
 */
export function mutate<T>(fn: (db: Database) => T): Promise<T> {
  return queued(async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      const { db, version } = await storage.load();
      const result = fn(db);
      if (await storage.save(db, version)) {
        persisted.add(db);
        return result;
      }
    }
    throw new Error("Could not save: the club changed under us five times in a row. Try again.");
  });
}

/** Runs one write after the other in this process: mutate, replace and snapshots share the queue. */
function queued<T>(work: () => Promise<T>): Promise<T> {
  const task = chain.then(work);
  chain = task.catch(() => undefined);
  return task;
}

/**
 * Replaces the whole state (import, restore, reset). Takes a labeled snapshot of the current one first.
 * Pass a function to build the new state from the current one inside the write queue (reset), so a change saved
 * a moment earlier is not lost; the save is version-checked like mutate(), and a conflict builds it again.
 */
export function replaceDb(next: Database | ((current: Database) => Database), label: string): Promise<void> {
  return queued(async () => {
    await storage.snapshot(label);
    for (let attempt = 0; attempt < 5; attempt++) {
      const { db, version } = await storage.load();
      const value = typeof next === "function" ? next(db) : next;
      if (await storage.save(value, version)) {
        persisted.add(value);
        return;
      }
    }
    throw new Error("Could not save the imported data.");
  });
}

export function listBackups(): Promise<BackupInfo[]> {
  return storage.listBackups();
}

export function readBackup(file: string): Promise<Database | null> {
  return storage.readBackup(file);
}

/** Saves the current state as a named snapshot without changing anything. Waits for pending writes first. */
export function takeSnapshot(label: string): Promise<string | null> {
  return queued(() => storage.snapshot(label));
}

export function deleteBackup(file: string): Promise<boolean> {
  return storage.deleteBackup(file);
}

export function newId(): string {
  return crypto.randomUUID();
}

export function nextSeq(db: Database): number {
  db.seq += 1;
  return db.seq;
}
