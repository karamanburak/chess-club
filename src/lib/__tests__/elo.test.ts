import { describe, expect, test } from "bun:test";
import { countsForRating, expectedScore, kFactor, performanceRating, recomputeRatings, scoreFor } from "../elo";
import { db, game, player } from "./fixtures";

describe("elo basics", () => {
  test("expected score is symmetric and 0.5 for equal ratings", () => {
    expect(expectedScore(1200, 1200)).toBe(0.5);
    expect(expectedScore(1400, 1200) + expectedScore(1200, 1400)).toBeCloseTo(1, 10);
    expect(expectedScore(1600, 1200)).toBeGreaterThan(0.9);
  });

  test("K factor follows the FIDE-like ladder", () => {
    expect(kFactor({ gamesPlayed: 0, rating: 1200 })).toBe(40);
    expect(kFactor({ gamesPlayed: 30, rating: 1200 })).toBe(20);
    expect(kFactor({ gamesPlayed: 100, rating: 2450 })).toBe(10);
  });

  test("scoreFor reads a result from each side, forfeits included", () => {
    expect(scoreFor("1-0", "white")).toBe(1);
    expect(scoreFor("1-0", "black")).toBe(0);
    expect(scoreFor("1/2-1/2", "black")).toBe(0.5);
    expect(scoreFor("-/+", "black")).toBe(1);
    expect(scoreFor("+/-", "black")).toBe(0);
  });

  test("performance rating uses the linear approximation", () => {
    expect(performanceRating([1400, 1400], 2)).toBe(1800);
    expect(performanceRating([1400, 1400], 1)).toBe(1400);
    expect(performanceRating([], 0)).toBeNull();
  });

  test("forfeits and unfinished games never count for rating", () => {
    expect(countsForRating(game("a", "b", "+/-"))).toBe(false);
    expect(countsForRating(game("a", "b", null))).toBe(false);
    expect(countsForRating(game("a", "b", "0-1"))).toBe(true);
  });
});

describe("recomputeRatings", () => {
  test("a win between equals moves both players by K/2", () => {
    const d = db([player("a"), player("b")], [game("a", "b", "1-0")]);
    recomputeRatings(d);
    const [a, b] = d.players;
    expect(a.rating).toBe(1220);
    expect(b.rating).toBe(1180);
    expect(a.wins).toBe(1);
    expect(b.losses).toBe(1);
    expect(d.games[0].whiteRatingBefore).toBe(1200);
    expect(d.games[0].whiteRatingAfter).toBe(1220);
  });

  test("unrated games count for W/D/L but leave ratings alone", () => {
    const d = db([player("a"), player("b")], [game("a", "b", "1/2-1/2", { rated: false })]);
    recomputeRatings(d);
    expect(d.players[0].rating).toBe(1200);
    expect(d.players[0].draws).toBe(1);
    expect(d.players[0].gamesPlayed).toBe(1);
  });

  test("forfeit wins change nothing", () => {
    const d = db([player("a"), player("b")], [game("a", "b", "+/-")]);
    recomputeRatings(d);
    expect(d.players[0].rating).toBe(1200);
    expect(d.players[0].gamesPlayed).toBe(0);
  });

  test("replay is idempotent and follows completion time, not insertion order", () => {
    const later = game("a", "b", "1-0", { completedAt: "2026-02-10T12:00:00.000Z" });
    const earlier = game("b", "a", "1-0", { completedAt: "2026-02-01T12:00:00.000Z" });
    const d = db([player("a"), player("b")], [later, earlier]);
    recomputeRatings(d);
    // "earlier" is played first: b beats a as white → b 1220, a 1180. Then a wins.
    expect(earlier.whiteRatingBefore).toBe(1200);
    expect(later.whiteRatingBefore).toBe(1180);
    const snapshot = JSON.stringify(d);
    recomputeRatings(d);
    expect(JSON.stringify(d)).toBe(snapshot);
  });

  test("editing a result changes the whole chain consistently", () => {
    const g1 = game("a", "b", "1-0");
    const g2 = game("a", "c", "1-0");
    const d = db([player("a"), player("b"), player("c")], [g1, g2]);
    recomputeRatings(d);
    const aBefore = d.players[0].rating;
    g1.result = "0-1";
    recomputeRatings(d);
    expect(d.players[0].rating).toBeLessThan(aBefore);
    expect(d.players[1].rating).toBe(1220);
    expect(g2.whiteRatingBefore).toBe(1180);
  });
});
