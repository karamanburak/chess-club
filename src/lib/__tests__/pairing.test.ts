import { describe, expect, test } from "bun:test";
import { assignColors, bracketSeedOrder, EMPTY_COLOR, generatePairings, nextPowerOfTwo, pairKey, roundRobinSchedule, type ColorStats } from "../pairing";
import { avatarChoices, face, isAvatar, pickAvatar, randomAvatar } from "../avatar";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);
const candidates = (n: number) => ids(n).map((id, i) => ({ id, score: 0, rating: 1500 - i * 50 }));

describe("generatePairings", () => {
  test("every player sits on exactly one board, nobody plays themselves", () => {
    for (let trial = 0; trial < 20; trial++) {
      const out = generatePairings({ players: candidates(8), previousPairs: new Set(), colorStats: new Map(), byeHistory: new Set(), mode: "random" });
      const seen = out.pairs.flatMap((p) => [p.whiteId, p.blackId]);
      expect(new Set(seen).size).toBe(8);
      expect(out.byeId).toBeNull();
      for (const p of out.pairs) expect(p.whiteId).not.toBe(p.blackId);
    }
  });

  test("odd field gives one bye, never to someone who already had one", () => {
    const out = generatePairings({ players: candidates(5), previousPairs: new Set(), colorStats: new Map(), byeHistory: new Set(["p1", "p2"]), mode: "random" });
    expect(out.pairs.length).toBe(2);
    expect(out.byeId).not.toBeNull();
    expect(["p3", "p4", "p5"]).toContain(out.byeId as string);
  });

  test("swiss bye goes to the lowest score, then lowest rating", () => {
    const players = candidates(5).map((c, i) => ({ ...c, score: i === 4 ? 0 : 1 }));
    const out = generatePairings({ players, previousPairs: new Set(), colorStats: new Map(), byeHistory: new Set(), mode: "swiss" });
    expect(out.byeId).toBe("p5");
  });

  test("rematches are avoided whenever a rematch-free pairing exists", () => {
    // 4 players, p1-p2 and p3-p4 already met: the only fresh pairings are p1-p3/p2-p4 or p1-p4/p2-p3.
    const previous = new Set([pairKey("p1", "p2"), pairKey("p3", "p4")]);
    for (let trial = 0; trial < 30; trial++) {
      const out = generatePairings({ players: candidates(4), previousPairs: previous, colorStats: new Map(), byeHistory: new Set(), mode: "swiss" });
      expect(out.rematches).toBe(0);
      for (const p of out.pairs) expect(previous.has(pairKey(p.whiteId, p.blackId))).toBe(false);
    }
  });

  test("reports rematches when they cannot be avoided", () => {
    const previous = new Set([pairKey("p1", "p2")]);
    const out = generatePairings({ players: candidates(2), previousPairs: previous, colorStats: new Map(), byeHistory: new Set(), mode: "random" });
    expect(out.pairs.length).toBe(1);
    expect(out.rematches).toBe(1);
  });
});

describe("assignColors", () => {
  const stats = (white: number, black: number, last: ColorStats["last"], streak: number): ColorStats => ({ white, black, last, streak });

  test("nobody gets the same color three times in a row", () => {
    const cs = new Map([
      ["a", stats(2, 0, "white", 2)],
      ["b", stats(1, 1, "white", 1)],
    ]);
    expect(assignColors("a", "b", cs)).toEqual({ whiteId: "b", blackId: "a" });
    const cs2 = new Map([
      ["a", stats(0, 2, "black", 2)],
      ["b", stats(1, 1, "black", 1)],
    ]);
    expect(assignColors("a", "b", cs2)).toEqual({ whiteId: "a", blackId: "b" });
  });

  test("the player with fewer whites gets white", () => {
    const cs = new Map([
      ["a", stats(3, 1, "white", 1)],
      ["b", stats(1, 3, "white", 1)],
    ]);
    expect(assignColors("a", "b", cs).whiteId).toBe("b");
  });

  test("equal balance: whoever had black last gets white", () => {
    const cs = new Map([
      ["a", stats(1, 1, "black", 1)],
      ["b", stats(1, 1, "white", 1)],
    ]);
    expect(assignColors("a", "b", cs).whiteId).toBe("a");
    expect(assignColors("x", "y", new Map([["x", EMPTY_COLOR]])).whiteId).toMatch(/x|y/);
  });
});

describe("roundRobinSchedule", () => {
  test("even field: n-1 rounds, everyone meets everyone once, no byes", () => {
    const rounds = roundRobinSchedule(ids(6));
    expect(rounds.length).toBe(5);
    const met = new Set<string>();
    for (const r of rounds) {
      expect(r.byeId).toBeNull();
      expect(r.pairs.length).toBe(3);
      for (const p of r.pairs) {
        const k = pairKey(p.whiteId, p.blackId);
        expect(met.has(k)).toBe(false);
        met.add(k);
      }
    }
    expect(met.size).toBe(15);
  });

  test("odd field: one bye per round, each player exactly once", () => {
    const rounds = roundRobinSchedule(ids(5));
    expect(rounds.length).toBe(5);
    const byes = rounds.map((r) => r.byeId);
    expect(new Set(byes).size).toBe(5);
    expect(byes.every(Boolean)).toBe(true);
  });

  test("colors stay balanced within one game", () => {
    const rounds = roundRobinSchedule(ids(8));
    const whites = new Map<string, number>();
    for (const r of rounds) for (const p of r.pairs) whites.set(p.whiteId, (whites.get(p.whiteId) ?? 0) + 1);
    for (const id of ids(8)) {
      const w = whites.get(id) ?? 0;
      expect(Math.abs(w - (7 - w))).toBeLessThanOrEqual(1);
    }
  });
});

describe("knockout helpers", () => {
  test("bracket seed order keeps 1 and 2 apart until the final", () => {
    expect(bracketSeedOrder(2)).toEqual([1, 2]);
    expect(bracketSeedOrder(4)).toEqual([1, 4, 2, 3]);
    expect(bracketSeedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });

  test("nextPowerOfTwo rounds up and never drops below 2", () => {
    expect(nextPowerOfTwo(1)).toBe(2);
    expect(nextPowerOfTwo(2)).toBe(2);
    expect(nextPowerOfTwo(5)).toBe(8);
    expect(nextPowerOfTwo(16)).toBe(16);
  });
});

describe("avatars", () => {
  test("a seed always draws the same face, different seeds differ", () => {
    expect(face("alice")).toEqual(face("alice"));
    expect(face("alice")).not.toEqual(face("bob"));
    const f = face("alice");
    expect(f.bg).not.toBe(f.body);
    expect(f.ink).toMatch(/^#/);
  });

  test("choices are stable and distinct", () => {
    const a = avatarChoices("p1", 24);
    expect(a).toEqual(avatarChoices("p1", 24));
    expect(new Set(a).size).toBe(24);
    expect(new Set(a.map((s) => JSON.stringify(face(s)))).size).toBeGreaterThan(18);
  });

  test("random seeds are valid avatars", () => {
    expect(isAvatar(randomAvatar())).toBe(true);
    expect(isAvatar("")).toBe(false);
    expect(pickAvatar("id-1")).toBe("id-1");
  });
});

describe("swiss rematch avoidance", () => {
  test("finds the rematch-free pairing even when the scores are all different", () => {
    // A–B and B–D met already. Greedy in score order takes A–C and is left with the rematch B–D.
    const players = [
      { id: "A", score: 2, rating: 1500 },
      { id: "B", score: 1.5, rating: 1500 },
      { id: "C", score: 1, rating: 1500 },
      { id: "D", score: 0.5, rating: 1500 },
    ];
    for (let i = 0; i < 20; i++) {
      const out = generatePairings({ players, previousPairs: new Set([pairKey("A", "B"), pairKey("B", "D")]), colorStats: new Map(), byeHistory: new Set(), mode: "swiss" });
      expect(out.rematches).toBe(0);
      expect(out.pairs.map((p) => pairKey(p.whiteId, p.blackId)).sort()).toEqual([pairKey("A", "D"), pairKey("B", "C")].sort());
    }
  });

  test("keeps score neighbours together when there is no rematch to avoid", () => {
    const players = ["a", "b", "c", "d", "e", "f"].map((id, i) => ({ id, score: 5 - i, rating: 1500 }));
    const out = generatePairings({ players, previousPairs: new Set(), colorStats: new Map(), byeHistory: new Set(), mode: "swiss" });
    expect(out.pairs.map((p) => pairKey(p.whiteId, p.blackId)).sort()).toEqual([pairKey("a", "b"), pairKey("c", "d"), pairKey("e", "f")].sort());
  });

  test("stays fast for a big late round with many earlier meetings", () => {
    const players = Array.from({ length: 40 }, (_, i) => ({ id: `p${i}`, score: Math.floor(i / 5), rating: 2000 - i }));
    const met = new Set<string>();
    for (let i = 0; i < 40; i++) for (let j = i + 1; j < Math.min(40, i + 8); j++) met.add(pairKey(`p${i}`, `p${j}`));
    const started = performance.now();
    const out = generatePairings({ players, previousPairs: met, colorStats: new Map(), byeHistory: new Set(), mode: "swiss" });
    expect(performance.now() - started).toBeLessThan(2000);
    expect(out.pairs.length).toBe(20);
    expect(out.rematches).toBe(0);
  });
});
