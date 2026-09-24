/**
 * The little chess the daily puzzle needs, pure and client-safe: read a FEN into squares and play a move given in
 * UCI ("e2e4", "e7e8q"). No legality check: the puzzle only ever accepts the moves of its solution (validated when
 * the set was built), so anything else is simply "not the move". Castling, en passant and promotion are applied.
 */
export type Color = "w" | "b";
export type PieceType = "p" | "n" | "b" | "r" | "q" | "k";
export interface Piece {
  color: Color;
  type: PieceType;
}
/** 64 squares, index 0 = a8 … 63 = h1 (FEN order). */
export type Squares = (Piece | null)[];

export interface Position {
  squares: Squares;
  turn: Color;
  /** Target square of an en passant capture, or null. */
  ep: string | null;
}

const FILES = "abcdefgh";

export function squareIndex(sq: string): number {
  const file = FILES.indexOf(sq[0]);
  const rank = Number(sq[1]);
  return (8 - rank) * 8 + file;
}

export function squareName(i: number): string {
  return `${FILES[i % 8]}${8 - Math.floor(i / 8)}`;
}

export function parseFen(fen: string): Position {
  const [placement, turn = "w", , ep = "-"] = fen.trim().split(/\s+/);
  const squares: Squares = [];
  for (const row of placement.split("/")) {
    for (const ch of row) {
      if (/\d/.test(ch)) for (let i = 0; i < Number(ch); i++) squares.push(null);
      else squares.push({ color: ch === ch.toUpperCase() ? "w" : "b", type: ch.toLowerCase() as PieceType });
    }
  }
  if (squares.length !== 64) throw new Error(`Bad FEN: ${fen}`);
  return { squares, turn: turn === "b" ? "b" : "w", ep: ep === "-" ? null : ep };
}

/** Plays a UCI move on a copy of the position. */
export function playUci(pos: Position, uci: string): Position {
  const from = squareIndex(uci.slice(0, 2));
  const to = squareIndex(uci.slice(2, 4));
  const squares = [...pos.squares];
  const piece = squares[from];
  if (!piece) return pos;
  // En passant: a pawn moving diagonally onto the empty ep square takes the pawn beside it.
  if (piece.type === "p" && uci.slice(2, 4) === pos.ep && !squares[to] && from % 8 !== to % 8) {
    squares[to + (piece.color === "w" ? 8 : -8)] = null;
  }
  // Castling: the king moves two files, the rook jumps over it.
  if (piece.type === "k" && Math.abs((from % 8) - (to % 8)) === 2) {
    const kingSide = to % 8 === 6;
    const rookFrom = kingSide ? to + 1 : to - 2;
    const rookTo = kingSide ? to - 1 : to + 1;
    squares[rookTo] = squares[rookFrom];
    squares[rookFrom] = null;
  }
  const promo = uci[4] as PieceType | undefined;
  squares[to] = promo ? { color: piece.color, type: promo } : piece;
  squares[from] = null;
  // A double pawn step opens en passant on the square it passed.
  const ep = piece.type === "p" && Math.abs(from - to) === 16 ? squareName((from + to) / 2) : null;
  return { squares, turn: pos.turn === "w" ? "b" : "w", ep };
}

/** Whether a move from→to would land a pawn on the last rank (the promotion piece comes from the solution). */
export function isPromotion(pos: Position, from: string, to: string): boolean {
  const p = pos.squares[squareIndex(from)];
  return !!p && p.type === "p" && (to[1] === "8" || to[1] === "1");
}
