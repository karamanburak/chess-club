import { describe, expect, test } from "bun:test";
import { generateKnockoutRound, syncKnockout } from "../knockout";
import { recomputeRatings } from "../elo";
import { knockoutPlacement, matchState } from "../queries";
import type { Database, GameResult, Tournament } from "../types";
import { db, player, tournament } from "./fixtures";

function setup(n = 6) {
  const players = Array.from({ length: n }, (_, i) => player(`p${i + 1}`, 1600 - i * 100));
  const t = tournament(
    players.map((p) => p.id),
    { pairingMode: "knockout", knockout: { gamesPerMatch: 1, thirdPlace: true, bracketSize: 0, matches: [] } },
  );
  const d = db(players, [], [t]);
  return { d, t };
}

/** Enters a result for every unplayed game of the round and lets the bracket react. */
function play(d: Database, t: Tournament, round: number, pick: (whiteId: string, blackId: string) => GameResult) {
  for (const g of d.games) {
    if (g.tournamentId === t.id && g.round === round && !g.result) {
      g.result = pick(g.whiteId, g.blackId);
      g.completedAt = "2026-02-01T12:00:00.000Z";
    }
  }
  syncKnockout(d, t);
  recomputeRatings(d);
}

const higherSeedWins = (w: string, b: string): GameResult => (Number(w.slice(1)) < Number(b.slice(1)) ? "1-0" : "0-1");

describe("generateKnockoutRound", () => {
  test("six players: bracket of 8, the two top seeds get a bye, four boards for the rest", () => {
    const { d, t } = setup(6);
    generateKnockoutRound(d, t);
    const ko = t.knockout!;
    expect(ko.bracketSize).toBe(8);
    expect(ko.matches.filter((m) => m.round === 1).length).toBe(4);
    const walkovers = ko.matches.filter((m) => m.round === 1 && (!m.a || !m.b));
    expect(walkovers.map((m) => m.winnerId).sort()).toEqual(["p1", "p2"]);
    expect(d.games.filter((g) => g.round === 1).length).toBe(2);
    expect(t.rounds[0].pairings.length).toBe(2);
    // Seeds 1 and 2 sit in opposite halves so they can only meet in the final.
    const slotOf = (id: string) => ko.matches.find((m) => m.round === 1 && (m.a === id || m.b === id))!.slot;
    expect(slotOf("p1") <= 2).not.toBe(slotOf("p2") <= 2);
  });

  test("refuses to advance while a match has no winner", () => {
    const { d, t } = setup(4);
    generateKnockoutRound(d, t);
    expect(() => generateKnockoutRound(d, t)).toThrow(/winner/);
  });

  test("winners meet in the next round; the final round also gets a third-place match", () => {
    const { d, t } = setup(4);
    generateKnockoutRound(d, t);
    play(d, t, 1, higherSeedWins);
    generateKnockoutRound(d, t); // final (2 rounds for 4 players)
    const finalRound = t.knockout!.matches.filter((m) => m.round === 2);
    expect(finalRound.length).toBe(2);
    const final = finalRound.find((m) => !m.thirdPlace)!;
    const third = finalRound.find((m) => m.thirdPlace)!;
    expect([final.a, final.b].sort()).toEqual(["p1", "p2"]);
    expect([third.a, third.b].sort()).toEqual(["p3", "p4"]);
    play(d, t, 2, higherSeedWins);
    const placement = knockoutPlacement(d, t);
    expect(placement.slice(0, 4).map((r) => [r.playerId, r.label])).toEqual([
      ["p1", "Champion"],
      ["p2", "Runner-up"],
      ["p3", "3rd place"],
      ["p4", "4th place"],
    ]);
  });

  test("a withdrawn player hands the match to the opponent", () => {
    const { d, t } = setup(4);
    generateKnockoutRound(d, t);
    t.withdrawnIds = ["p4"]; // p4 was to play p1 in round 1
    const m = t.knockout!.matches.find((x) => x.a === "p4" || x.b === "p4")!;
    expect(m.winnerId).toBeNull();
    // Play only the other semifinal, then advance: the walkover must be resolved automatically.
    for (const g of d.games) {
      if (g.round === 1 && g.whiteId !== "p4" && g.blackId !== "p4") {
        g.result = higherSeedWins(g.whiteId, g.blackId);
        g.completedAt = "2026-02-01T12:00:00.000Z";
      }
    }
    syncKnockout(d, t);
    generateKnockoutRound(d, t);
    expect(m.winnerId).toBe("p1");
    const final = t.knockout!.matches.find((x) => x.round === 2 && !x.thirdPlace)!;
    expect([final.a, final.b].sort()).toEqual(["p1", "p2"]);
  });
});

describe("syncKnockout", () => {
  test("a drawn match gets a tiebreak game with colors swapped; the tiebreak decides it", () => {
    const { d, t } = setup(4);
    generateKnockoutRound(d, t);
    const first = d.games.find((g) => g.round === 1)!;
    const m = t.knockout!.matches.find((x) => x.gameIds.includes(first.id))!;
    first.result = "1/2-1/2";
    first.completedAt = "2026-02-01T12:00:00.000Z";
    syncKnockout(d, t);
    expect(m.winnerId).toBeNull();
    expect(m.gameIds.length).toBe(2);
    const tiebreak = d.games.find((g) => g.id === m.gameIds[1])!;
    expect(tiebreak.whiteId).toBe(first.blackId);
    expect(tiebreak.blackId).toBe(first.whiteId);
    expect(t.rounds[0].pairings.some((p) => p.gameId === tiebreak.id)).toBe(true);
    tiebreak.result = "1-0";
    tiebreak.completedAt = "2026-02-01T13:00:00.000Z";
    syncKnockout(d, t);
    expect(m.winnerId).toBe(tiebreak.whiteId);
    expect(matchState(d, m).pending).toBe(0);
  });

  test("clearing the base result removes an unplayed tiebreak again", () => {
    const { d, t } = setup(4);
    generateKnockoutRound(d, t);
    const first = d.games.find((g) => g.round === 1)!;
    const m = t.knockout!.matches.find((x) => x.gameIds.includes(first.id))!;
    first.result = "1/2-1/2";
    first.completedAt = "x";
    syncKnockout(d, t);
    expect(m.gameIds.length).toBe(2);
    first.result = null;
    first.completedAt = null;
    syncKnockout(d, t);
    expect(m.gameIds.length).toBe(1);
    expect(d.games.filter((g) => g.round === 1).length).toBe(2);
  });

  test("two-game matches: 1-1 forces a tiebreak, 2-0 does not", () => {
    const { d, t } = setup(4);
    t.knockout!.gamesPerMatch = 2;
    generateKnockoutRound(d, t);
    expect(d.games.filter((g) => g.round === 1).length).toBe(4);
    const m = t.knockout!.matches.find((x) => x.round === 1 && x.a && x.b)!;
    const [g1, g2] = m.gameIds.map((id) => d.games.find((g) => g.id === id)!);
    expect(g1.whiteId).toBe(g2.blackId); // colors alternate within the match
    g1.result = "1-0";
    g1.completedAt = "x";
    g2.result = "1-0";
    g2.completedAt = "x";
    syncKnockout(d, t);
    expect(m.gameIds.length).toBe(3);
    expect(m.winnerId).toBeNull();
    const other = t.knockout!.matches.find((x) => x.round === 1 && x.a && x.b && x.id !== m.id)!;
    const [o1, o2] = other.gameIds.map((id) => d.games.find((g) => g.id === id)!);
    o1.result = "1-0";
    o1.completedAt = "x";
    o2.result = "0-1";
    o2.completedAt = "x";
    syncKnockout(d, t);
    expect(other.winnerId).toBe(o1.whiteId);
    expect(other.gameIds.length).toBe(2);
  });
});
