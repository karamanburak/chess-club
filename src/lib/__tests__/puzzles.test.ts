import { describe, expect, test } from "bun:test";
import { parseFen, playUci, squareIndex, squareName } from "../board";
import { PUZZLES, puzzleOfTheDay } from "../puzzles";

describe("board", () => {
  test("squares map both ways", () => {
    expect(squareIndex("a8")).toBe(0);
    expect(squareIndex("h1")).toBe(63);
    for (let i = 0; i < 64; i++) expect(squareIndex(squareName(i))).toBe(i);
  });

  test("castling moves the rook, en passant takes the pawn, promotion changes the piece", () => {
    const castle = playUci(parseFen("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1"), "e1g1");
    expect(castle.squares[squareIndex("g1")]).toEqual({ color: "w", type: "k" });
    expect(castle.squares[squareIndex("f1")]).toEqual({ color: "w", type: "r" });
    expect(castle.squares[squareIndex("h1")]).toBeNull();
    const long = playUci(castle, "e8c8");
    expect(long.squares[squareIndex("d8")]).toEqual({ color: "b", type: "r" });
    expect(long.squares[squareIndex("a8")]).toBeNull();

    const ep = playUci(parseFen("4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1"), "e5d6");
    expect(ep.squares[squareIndex("d5")]).toBeNull();
    expect(ep.squares[squareIndex("d6")]).toEqual({ color: "w", type: "p" });

    const promo = playUci(parseFen("8/4P1k1/8/8/8/8/8/4K3 w - - 0 1"), "e7e8n");
    expect(promo.squares[squareIndex("e8")]).toEqual({ color: "w", type: "n" });
    expect(promo.turn).toBe("b");
  });
});

describe("puzzle set", () => {
  test("365 unique puzzles, each playable on the board: the right side moves every time and nothing moves from an empty square", () => {
    expect(PUZZLES.length).toBe(365);
    expect(new Set(PUZZLES.map((p) => p.id)).size).toBe(365);
    for (const p of PUZZLES) {
      let pos = parseFen(p.fen);
      const solver = pos.turn;
      expect(p.moves.length % 2).toBe(1); // the solver makes the first and the last move
      if (p.goal === "mate1") expect(p.moves.length).toBe(1);
      if (p.goal === "mate2") expect(p.moves.length).toBe(3);
      p.moves.forEach((mv, i) => {
        const piece = pos.squares[squareIndex(mv.slice(0, 2))];
        expect(piece?.color).toBe(i % 2 === 0 ? solver : solver === "w" ? "b" : "w");
        pos = playUci(pos, mv);
      });
    }
  });

  test("the puzzle changes with the club's calendar day, not the UTC one", () => {
    // 23:30 UTC on 23 Sep is already 24 Sep in Berlin; 21:30 UTC is still 23 Sep.
    const lateUtc = new Date("2026-09-23T23:30:00Z");
    const sameBerlinDay = new Date("2026-09-24T12:00:00Z");
    expect(puzzleOfTheDay(lateUtc)).toBe(puzzleOfTheDay(sameBerlinDay));
    expect(puzzleOfTheDay(new Date("2026-09-23T21:30:00Z"))).not.toBe(puzzleOfTheDay(sameBerlinDay));
  });
});
