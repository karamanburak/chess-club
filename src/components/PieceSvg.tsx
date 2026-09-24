import type { Piece } from "@/lib/board";

/**
 * Flat chess pieces for the puzzle board, drawn on a 45×45 grid like the rest of the line-icon family (no unicode
 * glyphs: they render differently on every phone). White pieces are light with a dark outline, black ones dark with
 * a light inner line so they stay readable on both square colours and in both themes.
 */
const BASE = "M11 38.5h23a1.5 1.5 0 0 1 1.5 1.5v1.5h-26V40a1.5 1.5 0 0 1 1.5-1.5z";

const BODY: Record<Piece["type"], string> = {
  p: "M22.5 9a5 5 0 0 0-3.2 8.85C16.9 19.4 15.5 21.9 15.5 25c0 2 .7 3.6 1.9 4.9-2.4 2-3.9 5-4.4 8.6h19c-.5-3.6-2-6.6-4.4-8.6 1.2-1.3 1.9-2.9 1.9-4.9 0-3.1-1.4-5.6-3.8-7.15A5 5 0 0 0 22.5 9z",
  r: "M12 9h4.5v3.5h3.5V9h5v3.5h3.5V9H33v7l-3 2.5 1.2 14.5 2.3 5.5h-22l2.3-5.5L15 18.5 12 16z",
  b: "M22.5 5.5a2.6 2.6 0 0 0-1.6 4.6C16.4 12.6 13.5 17 13.5 22c0 3.6 1.9 6.1 4.4 7.5l-2.4 9h14l-2.4-9c2.5-1.4 4.4-3.9 4.4-7.5 0-2.7-.9-5.2-2.3-7.3l-6.2 6.2-1.8-1.8 6.4-6.4a18.6 18.6 0 0 0-3.9-3 2.6 2.6 0 0 0-1.6-4.6z",
  n: "M14.5 38.5h19c.5-6.4-.4-12.5-3.1-17.4-2.1-3.8-5.2-6.6-9-7.8l-.8-4.8-3.1 3.4-3.6-2.3-.3 4.3c-3.4 1.6-6 4.6-7.5 8.2-.8 2-.7 3.6.4 4.4 1 .7 2.3.5 3.2 0l3.7-1.7c1.2-.5 2.2-1.4 2.8-2.5.4 3.6-.8 7-3 10.1-.8 1.2-1.4 2.6-1.7 4.1z",
  q: "M9 13.5a2.5 2.5 0 1 0 3.3 2.4l3.8 9.1 2.9-11.6a2.5 2.5 0 1 0 2.4-.4l1.1 10.3 1.1-10.3a2.5 2.5 0 1 0 2.4.4l2.9 11.6 3.8-9.1A2.5 2.5 0 1 0 36 13.5l-3.5 15.5 1 9.5h-22l1-9.5L9 13.5z",
  k: "M21.25 4h2.5v3.25H27v2.5h-3.25v3.1c2 .5 3.3 2 3.3 4 0 .9-.3 1.8-.8 2.6 2.4-1.7 5.9-1.9 8.3.3 3.1 2.8 2.4 7.9-1.5 12.3l-.6 6.45h-20.9l-.6-6.45c-3.9-4.4-4.6-9.5-1.5-12.3 2.4-2.2 5.9-2 8.3-.3-.5-.8-.8-1.7-.8-2.6 0-2 1.3-3.5 3.3-4v-3.1H18v-2.5h3.25z",
};

export function PieceSvg({ piece, className = "" }: { piece: Piece; className?: string }) {
  const white = piece.color === "w";
  const fill = white ? "var(--piece-light, #f7f5ef)" : "var(--piece-dark, #25282f)";
  const stroke = white ? "#1d1f24" : "#0b0c0f";
  return (
    <svg viewBox="0 0 45 45" className={className} aria-hidden>
      <g fill={fill} stroke={stroke} strokeWidth={1.4} strokeLinejoin="round">
        <path d={BODY[piece.type]} />
        <path d={BASE} />
      </g>
      {!white && (
        // A light inner line on the base, so black pieces keep their shape on the dark squares.
        <path d="M13 40h19" stroke="#e9e6dc" strokeOpacity={0.55} strokeWidth={0.9} strokeLinecap="round" />
      )}
    </svg>
  );
}
