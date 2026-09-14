import { describe, expect, test } from "bun:test";
import { recomputeRatings } from "../elo";
import { crosstable, standings } from "../queries";
import { db, game, player, tournament } from "./fixtures";

function setup() {
  const players = [player("a", 1500), player("b", 1400), player("c", 1300), player("d", 1200)];
  const r1 = [game("a", "b", "1-0", { tournamentId: "t1", round: 1, board: 1 }), game("c", "d", "1-0", { tournamentId: "t1", round: 1, board: 2 })];
  const r2 = [game("a", "c", "1/2-1/2", { tournamentId: "t1", round: 2, board: 1 }), game("d", "b", "0-1", { tournamentId: "t1", round: 2, board: 2 })];
  // Round 3: d has the bye, a wins by forfeit against b (no rating change).
  const r3 = [game("a", "b", "+/-", { tournamentId: "t1", round: 3, board: 1, rated: false })];
  const t = tournament(["a", "b", "c", "d"], {
    tiebreaks: ["buchholz", "direct", "wins"],
    rounds: [
      { number: 1, pairings: r1.map((g, i) => ({ board: i + 1, whiteId: g.whiteId, blackId: g.blackId, gameId: g.id })), byePlayerId: null, createdAt: "x" },
      { number: 2, pairings: r2.map((g, i) => ({ board: i + 1, whiteId: g.whiteId, blackId: g.blackId, gameId: g.id })), byePlayerId: null, createdAt: "x" },
      { number: 3, pairings: r3.map((g, i) => ({ board: i + 1, whiteId: g.whiteId, blackId: g.blackId, gameId: g.id })), byePlayerId: "d", createdAt: "x" },
    ],
  });
  const d = db(players, [...r1, ...r2, ...r3], [t]);
  recomputeRatings(d);
  return { d, t };
}

describe("standings", () => {
  test("points, byes and forfeits are counted; tiebreaks order equal scores", () => {
    const { d, t } = setup();
    const rows = standings(d, t);
    const by = Object.fromEntries(rows.map((r) => [r.playerId, r]));
    // a 2.5, c 1.5, then b and d tied on 1: b wins the buchholz tiebreak.
    expect(rows.map((r) => r.playerId)).toEqual(["a", "c", "b", "d"]);
    expect(by.a.points).toBe(2.5);
    expect(by.b.points).toBe(1);
    expect(by.c.points).toBe(1.5);
    expect(by.d.points).toBe(1); // 0 from games + 1 bye
    expect(by.d.byes).toBe(1);
    expect(by.a.forfeitsWon).toBe(1);
    expect(by.b.blackWins).toBe(1);
    expect(by.a.roundScores).toEqual([1, 0.5, 1]);
    expect(by.d.roundScores).toEqual([0, 0, 1]);
  });

  test("buchholz sums opponents' points, direct encounter only counts inside a tie", () => {
    const { d, t } = setup();
    const by = Object.fromEntries(standings(d, t).map((r) => [r.playerId, r]));
    // a met b twice (1 + 1) and c (1.5) → 3.5
    expect(by.a.buchholz).toBe(3.5);
    // b and d are tied on 1 point and met once: d lost to b as white.
    expect(by.b.direct).toBe(1);
    expect(by.d.direct).toBe(0);
    expect(by.a.direct).toBe(0);
    expect(by.b.opponents).toEqual(["a", "d", "a"]);
  });

  test("performance rating ignores forfeit games", () => {
    const { d, t } = setup();
    const by = Object.fromEntries(standings(d, t).map((r) => [r.playerId, r]));
    // Opponent ratings are taken at game time: b 1400 in round 1, c 1314 in round 2 (c had beaten d).
    // 1.5 points from two games → avg 1357 + 800*0.75 - 400 = 1557
    expect(by.a.performance).toBe(1557);
  });

  test("tiebreak order decides between equal scores", () => {
    const { d, t } = setup();
    // With "wins" before "buchholz", b (2 wins) must still sit behind c (1.5 points) but above d.
    const rows = standings(d, { ...t, tiebreaks: ["wins", "buchholz"] });
    expect(rows.map((r) => r.playerId)).toEqual(["a", "c", "b", "d"]);
    // Sonneborn-Berger for a: beat b (1) twice → 2, half of c's 1.5 → 0.75, total 2.75
    expect(rows[0].sonneborn).toBe(2.75);
  });

  test("withdrawn players stay in the table with their flag", () => {
    const { d, t } = setup();
    const rows = standings(d, { ...t, withdrawnIds: ["d"] });
    expect(rows.find((r) => r.playerId === "d")?.withdrawn).toBe(true);
  });

  test("crosstable mirrors every result", () => {
    const { d, t } = setup();
    const cross = crosstable(d, t);
    const ab = cross.get("a")?.get("b") ?? [];
    const ba = cross.get("b")?.get("a") ?? [];
    expect(ab.length).toBe(2);
    expect(ab.map((c) => c.score)).toEqual([1, 1]);
    expect(ba.map((c) => c.score)).toEqual([0, 0]);
  });
});
