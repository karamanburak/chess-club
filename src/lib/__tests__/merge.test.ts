import { describe, expect, test } from "bun:test";
import { recomputeRatings } from "../elo";
import { mergeCheck, mergePlayers } from "../merge";
import { db, game, player, tournament } from "./fixtures";

/** "anna" was added twice: as a (old, with games) and as a2 (new duplicate). c is an opponent. */
function club() {
  const g1 = game("a", "c", "1-0");
  const g2 = game("c", "a2", "0-1", { tournamentId: "t1", round: 1, board: 1 });
  const g3 = game("a2", "c", "1/2-1/2", { sessionId: "s1" });
  const d = db(
    [player("a", 1200, { createdAt: "2026-01-01T00:00:00.000Z", note: "" }), player("a2", 1200, { createdAt: "2026-03-01T00:00:00.000Z", pinHash: "pin-of-a2", note: "left-handed" }), player("c")],
    [g1, g2, g3],
    [tournament(["a2", "c"], { rounds: [{ number: 1, pairings: [{ board: 1, whiteId: "c", blackId: "a2", gameId: g2.id }], byePlayerId: null, createdAt: g2.createdAt }] })],
  );
  d.sessions = [{ id: "s1", createdAt: g3.createdAt, closedAt: null, presentIds: ["a2", "c"], rated: true, avoidRematches: true, rounds: [{ number: 1, pairings: [{ board: 1, whiteId: "a2", blackId: "c", gameId: g3.id }], byePlayerId: "a2", createdAt: g3.createdAt }] }];
  d.seasons = [{ id: "s", name: "Season 2025", start: "2025-01-01", end: "2025-12-31", championId: "a2" }];
  recomputeRatings(d);
  return d;
}

describe("mergeCheck", () => {
  test("refuses the same player, unknown ids and records that met each other", () => {
    const d = club();
    expect(mergeCheck(d, "a", "a")).toBe("same");
    expect(mergeCheck(d, "a", "nope")).toBe("notFound");
    expect(mergeCheck(d, "a2", "a")).toBeNull();
    expect(mergeCheck(d, "a", "c")).toBe("playedEachOther");
    d.games = [];
    expect(mergeCheck(d, "a2", "c")).toBe("sharedTournament");
    d.tournaments = [];
    expect(mergeCheck(d, "a2", "c")).toBe("sharedSession");
  });
});

describe("mergePlayers", () => {
  test("rewrites every reference, keeps the target's identity and inherits what it lacks", () => {
    const d = club();
    const summary = mergePlayers(d, "a2", "a");
    recomputeRatings(d);

    expect(summary).toEqual({ games: 2, tournaments: 1, sessions: 1 });
    expect(d.players.map((p) => p.id).sort()).toEqual(["a", "c"]);
    expect(d.games.every((g) => g.whiteId !== "a2" && g.blackId !== "a2")).toBe(true);
    expect(d.tournaments[0].participantIds).toEqual(["a", "c"]);
    expect(d.tournaments[0].rounds[0].pairings[0].blackId).toBe("a");
    expect(d.sessions[0].presentIds).toEqual(["a", "c"]);
    expect(d.sessions[0].rounds[0].byePlayerId).toBe("a");
    expect(d.seasons[0].championId).toBe("a");

    const a = d.players.find((p) => p.id === "a")!;
    expect(a.pinHash).toBe("pin-of-a2");
    expect(a.note).toBe("left-handed");
    expect(a.createdAt).toBe("2026-01-01T00:00:00.000Z");
    // 3 games replayed onto one record: 2 wins, 1 draw
    expect(a).toMatchObject({ gamesPlayed: 3, wins: 2, draws: 1, losses: 0 });
  });

  test("the target keeps its own PIN and note when it has them", () => {
    const d = club();
    const a = d.players.find((p) => p.id === "a")!;
    a.pinHash = "pin-of-a";
    a.note = "captain";
    mergePlayers(d, "a2", "a");
    expect(a.pinHash).toBe("pin-of-a");
    expect(a.note).toBe("captain");
  });

  test("throws instead of producing a game against oneself", () => {
    const d = club();
    expect(() => mergePlayers(d, "a", "c")).toThrow(/playedEachOther/);
  });
});
