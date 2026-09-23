import { describe, expect, test } from "bun:test";
import { recomputeRatings } from "../elo";
import { checkHealth } from "../health";
import { db, game, player, tournament } from "./fixtures";

function healthy() {
  const g1 = game("a", "b", "1-0", { tournamentId: "t1", round: 1, board: 1 });
  const d = db([player("a"), player("b"), player("c")], [g1], [tournament(["a", "b", "c"], { rounds: [{ number: 1, pairings: [{ board: 1, whiteId: "a", blackId: "b", gameId: g1.id }], byePlayerId: "c", createdAt: g1.createdAt }] })]);
  d.seq = Math.max(...d.games.map((g) => g.seq));
  recomputeRatings(d);
  return d;
}

describe("checkHealth", () => {
  test("a consistent club has no problems and a correct summary", () => {
    const r = checkHealth(healthy());
    expect(r.problems).toEqual([]);
    expect(r.summary).toMatchObject({ players: 3, activePlayers: 3, games: 1, completed: 1, open: 0, tournaments: 1, runningTournaments: 1 });
  });

  test("finds dangling players, misplaced games and bad byes", () => {
    const d = healthy();
    d.games[0].blackId = "ghost";
    d.games[0].round = 2;
    d.tournaments[0].rounds[0].byePlayerId = "zed";
    const codes = checkHealth(d).problems.map((p) => p.code);
    expect(codes).toContain("blackMissing");
    expect(codes).toContain("boardGameElsewhere");
    expect(codes).toContain("byeNotParticipant");
  });

  test("flags ratings that were edited by hand", () => {
    const d = healthy();
    d.players[0].rating = 1999;
    const r = checkHealth(d);
    expect(r.problems).toHaveLength(1);
    expect(r.problems[0].code).toBe("ratingDrift");
    expect(r.problems[0].text).toContain("A");
    expect(r.problems[0].text).toContain("rating=1999");
  });

  test("knockout winner must be one of the two sides", () => {
    const d = healthy();
    d.tournaments[0].knockout = { gamesPerMatch: 1, thirdPlace: false, bracketSize: 4, matches: [{ id: "m", round: 1, slot: 1, a: "a", b: "b", seedA: 1, seedB: 2, gameIds: [d.games[0].id], winnerId: "c", thirdPlace: false }] };
    expect(checkHealth(d).problems.map((p) => p.code)).toContain("koWinnerNeither");
  });

  test("does not modify the database it inspects", () => {
    const d = healthy();
    d.players[0].rating = 1999;
    const before = JSON.stringify(d);
    checkHealth(d);
    expect(JSON.stringify(d)).toBe(before);
  });

  test("messages can be swapped for another language", async () => {
    const d = healthy();
    d.players[0].rating = 1999;
    const r = checkHealth(d, { ...(await import("../health")).DEFAULT_HEALTH_MSGS, ratingDrift: "Wertung von {name} stimmt nicht" });
    expect(r.problems[0].text).toBe("Wertung von A stimmt nicht");
  });

  test("flags challenges that point at missing players or games", () => {
    const d = healthy();
    const base = { at: "2026-01-01T18:00:00.000Z", place: "", timeControl: "", note: "", proposedBy: "a", whiteId: null, rated: true, createdAt: "x", updatedAt: "x" };
    d.challenges = [
      { ...base, id: "c1", fromId: "a", toId: "ghost", status: "pending", gameId: null },
      { ...base, id: "c2", fromId: "a", toId: "b", status: "played", gameId: "gone" },
    ];
    const codes = checkHealth(d).problems.map((p) => p.code);
    expect(codes).toContain("challengePlayerMissing");
    expect(codes).toContain("challengeGameMissing");
  });
});
