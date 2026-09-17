import { describe, expect, test } from "bun:test";
import { recomputeRatings } from "../elo";
import { applyReset, deleteAllFriendlies, deleteAllSessions, deleteAllTournaments, isResetScope, resetCounts, resetEverything, resetHistory } from "../reset";
import { db, game, player, tournament } from "./fixtures";
import type { ClubSession } from "../types";

function session(id: string, gameIds: string[]): ClubSession {
  return {
    id,
    createdAt: "2026-02-01T18:00:00.000Z",
    closedAt: null,
    presentIds: ["a", "b"],
    rated: true,
    avoidRematches: true,
    rounds: [{ number: 1, pairings: gameIds.map((gameId, i) => ({ board: i + 1, whiteId: "a", blackId: "b", gameId })), byePlayerId: null, createdAt: "2026-02-01T18:00:00.000Z" }],
  };
}

/** Two players, one friendly, one tournament game, one club-night game; a, b have played and moved off 1200. */
function club() {
  const friendly = game("a", "b", "1-0");
  const inTournament = game("a", "b", "0-1", { tournamentId: "t1", round: 1, board: 1 });
  const onClubNight = game("b", "a", "1/2-1/2", { sessionId: "s1" });
  const d = db([player("a"), player("b", 1300, { pinHash: "hash", note: "keep me" })], [friendly, inTournament, onClubNight], [tournament(["a", "b"])]);
  d.sessions = [session("s1", [onClubNight.id])];
  d.seasons = [{ id: "season-2025-01-01", name: "Season 2025", start: "2025-01-01", end: "2025-12-31", championId: "a" }, { id: "season-2026-01-01", name: "Season 2026", start: "2026-01-01", end: null, championId: null }];
  d.activity = [{ id: "x", at: "2026-01-01T00:00:00.000Z", admin: true, text: "something" }];
  d.settings.adminPasswordHash = "pw";
  d.settings.memberCodeHash = "code";
  recomputeRatings(d);
  return { d, friendly, inTournament, onClubNight };
}

describe("resetCounts", () => {
  test("splits games by where they were played", () => {
    const { d } = club();
    expect(resetCounts(d, "everything")).toEqual({ players: 2, games: 3, tournaments: 1, sessions: 1 });
    expect(resetCounts(d, "history")).toEqual({ players: 0, games: 3, tournaments: 1, sessions: 1 });
    expect(resetCounts(d, "tournaments")).toEqual({ players: 0, games: 1, tournaments: 1, sessions: 0 });
    expect(resetCounts(d, "sessions")).toEqual({ players: 0, games: 1, tournaments: 0, sessions: 1 });
    expect(resetCounts(d, "friendlies")).toEqual({ players: 0, games: 1, tournaments: 0, sessions: 0 });
  });
});

describe("resetEverything", () => {
  test("empties the club but keeps settings and opens a fresh season", () => {
    const { d } = club();
    const removed = resetEverything(d, "2026-09-17");
    expect(removed).toEqual({ players: 2, games: 3, tournaments: 1, sessions: 1 });
    expect(d.players).toEqual([]);
    expect(d.games).toEqual([]);
    expect(d.tournaments).toEqual([]);
    expect(d.sessions).toEqual([]);
    expect(d.activity).toEqual([]);
    expect(d.seq).toBe(0);
    expect(d.seasons).toEqual([{ id: "season-2026-09-17", name: "Season 2026", start: "2026-09-17", end: null, championId: null }]);
    expect(d.settings.adminPasswordHash).toBe("pw");
    expect(d.settings.memberCodeHash).toBe("code");
    expect(d.settings.club.name).toBe("Test Club");
  });
});

describe("resetHistory", () => {
  test("keeps players with PIN and note, drops their record, ratings return to the start", () => {
    const { d } = club();
    expect(d.players[1].rating).not.toBe(1300);
    const removed = resetHistory(d, "2026-09-17");
    recomputeRatings(d);
    expect(removed).toEqual({ players: 0, games: 3, tournaments: 1, sessions: 1 });
    expect(d.players.map((p) => p.id)).toEqual(["a", "b"]);
    expect(d.players[1]).toMatchObject({ pinHash: "hash", note: "keep me", rating: 1300, gamesPlayed: 0, wins: 0, draws: 0, losses: 0 });
    expect(d.games).toEqual([]);
    expect(d.tournaments).toEqual([]);
    expect(d.sessions).toEqual([]);
    expect(d.seasons).toHaveLength(1);
    expect(d.seasons[0].end).toBeNull();
    // the activity log is history the admin wants to keep readable
    expect(d.activity).toHaveLength(1);
  });
});

describe("partial deletes", () => {
  test("deleteAllTournaments removes tournaments and only their games", () => {
    const { d, friendly, onClubNight } = club();
    expect(deleteAllTournaments(d)).toEqual({ players: 0, games: 1, tournaments: 1, sessions: 0 });
    expect(d.tournaments).toEqual([]);
    expect(d.games.map((g) => g.id).sort()).toEqual([friendly.id, onClubNight.id].sort());
    expect(d.sessions).toHaveLength(1);
  });

  test("deleteAllSessions removes club nights and only their games", () => {
    const { d, friendly, inTournament } = club();
    expect(deleteAllSessions(d)).toEqual({ players: 0, games: 1, tournaments: 0, sessions: 1 });
    expect(d.sessions).toEqual([]);
    expect(d.games.map((g) => g.id).sort()).toEqual([friendly.id, inTournament.id].sort());
    expect(d.tournaments).toHaveLength(1);
  });

  test("deleteAllFriendlies leaves tournament and club-night games alone", () => {
    const { d, inTournament, onClubNight } = club();
    expect(deleteAllFriendlies(d)).toEqual({ players: 0, games: 1, tournaments: 0, sessions: 0 });
    expect(d.games.map((g) => g.id).sort()).toEqual([inTournament.id, onClubNight.id].sort());
  });

  test("a game that is both in a tournament and a session counts as a tournament game", () => {
    const { d } = club();
    d.games.push(game("a", "b", "1-0", { tournamentId: "t1", sessionId: "s1" }));
    expect(resetCounts(d, "tournaments").games).toBe(2);
    expect(resetCounts(d, "sessions").games).toBe(1);
    deleteAllSessions(d);
    expect(d.games.filter((g) => g.tournamentId)).toHaveLength(2);
  });
});

describe("applyReset / isResetScope", () => {
  test("dispatches by scope and rejects unknown ones", () => {
    const { d } = club();
    expect(applyReset(d, "friendlies")).toEqual({ players: 0, games: 1, tournaments: 0, sessions: 0 });
    expect(isResetScope("history")).toBe(true);
    expect(isResetScope("players")).toBe(false);
    expect(isResetScope(null)).toBe(false);
  });

  test("after a reset the ratings replay cleanly on an empty game list", () => {
    const { d } = club();
    applyReset(d, "everything");
    expect(() => recomputeRatings(d)).not.toThrow();
  });
});
