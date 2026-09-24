import { describe, expect, test } from "bun:test";
import { dayBefore, isSolution, puzzleDay, puzzleStats } from "../puzzle-stats";
import { mergePlayers } from "../merge";
import { applyReset } from "../reset";
import type { PuzzleSolve } from "../types";
import { db, player } from "./fixtures";

const solve = (playerId: string, day: string, over: Partial<PuzzleSolve> = {}): PuzzleSolve => ({
  day,
  playerId,
  puzzleId: "p",
  result: "solved",
  misses: 0,
  hint: false,
  at: `${day}T18:00:00.000Z`,
  ...over,
});

describe("isSolution", () => {
  test("only the solver's moves of the line count; a mate may end with any mating alternative", () => {
    const p = { moves: ["e4f6", "g8h8", "g4d4"], alt: ["g4g7"] };
    expect(isSolution(p, ["e4f6", "g4d4"])).toBe(true);
    expect(isSolution(p, ["e4f6", "g4g7"])).toBe(true);
    expect(isSolution(p, ["e4f6"])).toBe(false);
    expect(isSolution(p, ["g4d4", "e4f6"])).toBe(false);
    expect(isSolution({ moves: ["h2h1"] }, ["h2h1"])).toBe(true);
    expect(isSolution({ moves: ["h2h1"] }, [])).toBe(false);
  });

  test("dayBefore crosses months and years", () => {
    expect(dayBefore("2026-10-01")).toBe("2026-09-30");
    expect(dayBefore("2026-01-01")).toBe("2025-12-31");
    expect(dayBefore("2026-03-29")).toBe("2026-03-28");
  });
});

describe("puzzleStats", () => {
  test("streak ends today or yesterday, a missed day breaks it, gave-up days do not count", () => {
    const d = db([player("a"), player("b"), player("c")]);
    d.puzzleSolves = [
      // a: 20, 21, 22 solved (today 23 still open) → streak 3; earlier run of 2
      solve("a", "2026-09-15"), solve("a", "2026-09-16"),
      solve("a", "2026-09-20", { misses: 2 }), solve("a", "2026-09-21", { hint: true }), solve("a", "2026-09-22"),
      // b: solved today but not yesterday → 1; one day given up
      solve("b", "2026-09-23"), solve("b", "2026-09-21", { result: "shown" }),
      // c: last solved two days ago → 0
      solve("c", "2026-09-21"),
    ];
    const s = Object.fromEntries(puzzleStats(d, "2026-09-23").map((r) => [r.playerId, r]));
    expect(s.a).toMatchObject({ solved: 5, streak: 3, best: 3, hints: 1, clean: 3, avgMisses: 0.4 });
    expect(s.b).toMatchObject({ solved: 1, shown: 1, streak: 1, best: 1 });
    expect(s.c).toMatchObject({ solved: 1, streak: 0 });
    expect(puzzleStats(d, "2026-09-23")[0].playerId).toBe("a");
    expect(puzzleDay(d, "2026-09-21").map((x) => x.playerId).sort()).toEqual(["a", "b", "c"]);
  });
});

describe("puzzle days follow players", () => {
  test("a merge moves them over, keeping the surviving record's own entry on a shared day; a reset clears them", () => {
    const d = db([player("a"), player("dup")]);
    d.puzzleSolves = [solve("a", "2026-09-22"), solve("dup", "2026-09-22", { misses: 5 }), solve("dup", "2026-09-21")];
    mergePlayers(d, "dup", "a");
    expect(d.puzzleSolves.map((x) => [x.playerId, x.day, x.misses])).toEqual([
      ["a", "2026-09-22", 0],
      ["a", "2026-09-21", 0],
    ]);
    applyReset(d, "history", "2026-09-24");
    expect(d.puzzleSolves).toEqual([]);
  });
});
