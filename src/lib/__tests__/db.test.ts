import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "chess-club-test-"));
process.env.CHESS_DATA_DIR = dir;
// Imported after the env var is set so DATA_DIR points at the temp folder.
const dbModule = await import("../db");
const { BACKUP_DIR, migrate, mutate, pruneBackups, readDb } = dbModule;

beforeAll(() => fs.mkdirSync(BACKUP_DIR, { recursive: true }));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("migrate", () => {
  test("fills in fields older files lack and gives every player a unique avatar", () => {
    const raw = {
      version: 2,
      seq: 3,
      players: [
        { id: "a", name: "A", initialRating: 1200, rating: 1200, gamesPlayed: 0, wins: 0, draws: 0, losses: 0, active: true, createdAt: "2026-01-01" },
        { id: "b", name: "B", initialRating: 1200, rating: 1200, gamesPlayed: 0, wins: 0, draws: 0, losses: 0, active: true, createdAt: "2026-01-01" },
        { id: "c", name: "C", initialRating: 1200, rating: 1200, gamesPlayed: 0, wins: 0, draws: 0, losses: 0, active: true, createdAt: "2026-01-01", avatar: "🐸" },
      ],
      games: [{ id: "g1", seq: 1, tournamentId: null, round: null, board: null, whiteId: "a", blackId: "b", result: "1-0", rated: true, createdAt: "x", completedAt: "x" }],
      tournaments: [{ id: "t", name: "T", date: "2026-01-01", status: "planned", pairingMode: "swiss", plannedRounds: 3, rated: true, participantIds: [], rounds: [], createdAt: "x" }],
      settings: { startRating: 1000 },
    };
    const db = migrate(raw);
    expect(db.activity).toEqual([]);
    expect(db.sessions).toEqual([]);
    expect(db.games[0].sessionId).toBeNull();
    expect(db.tournaments[0].withdrawnIds).toEqual([]);
    expect(db.tournaments[0].tiebreaks).toEqual(db.settings.defaultTiebreaks);
    expect(db.settings.startRating).toBe(1000);
    expect(db.settings.byePoints).toBe(1);
    const faces = db.players.map((p) => p.avatar);
    expect(faces.every(Boolean)).toBe(true);
    expect(new Set(faces).size).toBe(3);
    expect(db.players[2].avatar).toBe("🐸");
    // Deterministic: a second migration of the same raw file agrees.
    expect(migrate(JSON.parse(JSON.stringify(raw))).players.map((p) => p.avatar)).toEqual(faces);
  });

  test("challenges from before the rated choice count for Elo, newer ones keep their flag", () => {
    const base = { fromId: "a", toId: "b", at: "2026-01-05T18:00:00.000Z", place: "", timeControl: "", note: "", status: "pending", proposedBy: "a", gameId: null, createdAt: "x", updatedAt: "x" };
    const db = migrate({ players: [], games: [], tournaments: [], challenges: [{ ...base, id: "old" }, { ...base, id: "fun", whiteId: "a", rated: false }] });
    expect(db.challenges.map((c) => [c.id, c.rated, c.whiteId])).toEqual([
      ["old", true, null],
      ["fun", false, "a"],
    ]);
  });

  test("turns a v1 quickSession into a club night with one round", () => {
    const db = migrate({
      players: [],
      games: [{ id: "g1", seq: 1, whiteId: "a", blackId: "b", result: null, rated: true, createdAt: "x", completedAt: null }],
      tournaments: [],
      quickSession: { createdAt: "2026-01-05T18:00:00.000Z", byePlayerId: "c", pairings: [{ whiteId: "a", blackId: "b", gameId: "g1" }] },
    });
    expect(db.sessions.length).toBe(1);
    const s = db.sessions[0];
    expect(new Set(s.presentIds)).toEqual(new Set(["a", "b", "c"]));
    expect(s.rounds[0].pairings[0]).toMatchObject({ board: 1, gameId: "g1" });
    expect(db.games[0].sessionId).toBe(s.id);
    expect("quickSession" in db).toBe(false);
  });
});

describe("storage", () => {
  test("readDb creates an empty database when the file is missing, mutate persists", async () => {
    const fresh = await readDb();
    expect(fresh.players).toEqual([]);
    await mutate((db) => {
      db.seq = 42;
    });
    expect((await readDb()).seq).toBe(42);
  });

  test("concurrent mutations run one after another, nothing is lost", async () => {
    await Promise.all(Array.from({ length: 10 }, (_, i) => mutate((db) => db.activity.push({ id: `a${i}`, at: "x", admin: false, text: `${i}` }))));
    expect((await readDb()).activity.length).toBe(10);
  });

  test("pruneBackups keeps the newest N files of any snapshot kind", () => {
    const names = ["db-2026-01-01.json", "db-before-import-2026-01-02T10-00-00-000Z.json", "db-2026-01-03.json", "db-before-restore-2026-01-04T10-00-00-000Z.json", "db-2026-01-05.json"];
    names.forEach((n, i) => {
      const f = path.join(BACKUP_DIR, n);
      fs.writeFileSync(f, "{}");
      const t = new Date(2026, 0, i + 1);
      fs.utimesSync(f, t, t);
    });
    // The mutate() above already wrote today's daily snapshot, so count what is there and drop the two oldest.
    const total = fs.readdirSync(BACKUP_DIR).filter((f) => f.endsWith(".json")).length;
    const removed = pruneBackups(total - 2);
    expect(removed.sort()).toEqual(["db-2026-01-01.json", "db-before-import-2026-01-02T10-00-00-000Z.json"].sort());
    expect(fs.readdirSync(BACKUP_DIR).filter((f) => f.endsWith(".json")).length).toBe(total - 2);
  });
});
