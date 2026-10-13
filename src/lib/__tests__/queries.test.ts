import { describe, expect, test } from "bun:test";
import { recomputeRatings } from "../elo";
import { clubStats, ratingsAsOf, rankChanges, standings, streaks } from "../queries";
import type { Database, GameResult } from "../types";
import { db, game, player, tournament } from "./fixtures";

/** The original implementation: deep clone, keep games completed up to the cutoff, replay. */
function replayAsOf(d: Database, iso: string): Map<string, number> {
  const clone: Database = JSON.parse(JSON.stringify(d));
  clone.games = clone.games.filter((g) => g.completedAt !== null && g.completedAt <= iso);
  recomputeRatings(clone);
  return new Map(clone.players.map((p) => [p.id, p.rating]));
}

function busyClub() {
  const ids = ["a", "b", "c", "d", "e"];
  const players = ids.map((id, i) => player(id, 1300 + i * 60));
  const results: GameResult[] = ["1-0", "0-1", "1/2-1/2", "+/-", "1-0", "0-1"];
  const games = [];
  for (let i = 0; i < 40; i++) {
    const w = ids[i % 5];
    const b = ids[(i * 3 + 1) % 5] === w ? ids[(i + 2) % 5] : ids[(i * 3 + 1) % 5];
    const day = String(1 + (i % 28)).padStart(2, "0");
    const month = i < 28 ? "02" : "03";
    // Several games share a timestamp so the seq tie-break matters; some are unrated, one is still open.
    const at = `2026-${month}-${day}T1${i % 3}:00:00.000Z`;
    games.push(game(w, b, i === 39 ? null : results[i % results.length], { rated: i % 7 !== 0, completedAt: i === 39 ? null : at }));
  }
  const d = db(players, games);
  recomputeRatings(d);
  return d;
}

describe("ratingsAsOf", () => {
  test("agrees with a full replay at every cutoff", () => {
    const d = busyClub();
    const cutoffs = ["2025-12-31T00:00:00.000Z", ...d.games.filter((g) => g.completedAt).map((g) => g.completedAt!), "2026-12-31T00:00:00.000Z"];
    for (const at of cutoffs) expect([...ratingsAsOf(d, at)]).toEqual([...replayAsOf(d, at)]);
  });

  test("rankChanges does not touch the database", () => {
    const d = busyClub();
    const before = JSON.stringify(d);
    rankChanges(d, 30);
    expect(JSON.stringify(d)).toBe(before);
  });
});

describe("streaks and clubStats", () => {
  test("the club's longest win streak matches the per-player streaks", () => {
    const d = busyClub();
    const best = Math.max(...d.players.map((p) => streaks(d, p.id).longestWin));
    expect(clubStats(d).longestWinStreak?.length).toBe(best);
  });
});

describe("standings in knockout rounds", () => {
  test("a round with a tiebreak game adds both games to the round score", () => {
    const g1 = game("a", "b", "1/2-1/2", { tournamentId: "t1", round: 1, board: 1 });
    const g2 = game("b", "a", "0-1", { tournamentId: "t1", round: 1, board: 2 });
    const t = tournament(["a", "b"], {
      pairingMode: "knockout",
      rounds: [{ number: 1, pairings: [g1, g2].map((g, i) => ({ board: i + 1, whiteId: g.whiteId, blackId: g.blackId, gameId: g.id })), byePlayerId: null, createdAt: "x" }],
    });
    const d = db([player("a"), player("b")], [g1, g2], [t]);
    const by = Object.fromEntries(standings(d, t).map((r) => [r.playerId, r]));
    expect(by.a.roundScores).toEqual([1.5]);
    expect(by.b.roundScores).toEqual([0.5]);
  });
});
