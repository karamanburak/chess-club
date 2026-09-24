"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { recordPuzzle } from "@/lib/actions";
import { isPromotion, parseFen, playUci, squareName, type Position } from "@/lib/board";
import { fmt, plural } from "@/lib/i18n";
import type { Puzzle } from "@/lib/puzzles";
import { PieceSvg } from "./PieceSvg";
import { useT } from "./I18nProvider";

type Status = "play" | "good" | "wrong" | "solved" | "shown";

/** How long the opponent "thinks" before the reply appears, and the pace of "show solution". */
const REPLY_MS = 450;

/**
 * The daily puzzle: tap a piece, then its square. "Hint" makes the piece that has to move glow (not where it goes);
 * a puzzle solved after a hint says so. On a claimed device (`record`) the outcome also goes to the server once
 * (`recordPuzzle`, which checks the moves) and today's stored outcome (`saved`) is shown on every device of the player. Only the solution's move counts (for a mate, any mating move on the
 * last step); the opponent's reply plays by itself. Solved or revealed is remembered per device and day in
 * localStorage, so coming back shows the finished board; nothing is sent to the server.
 */
export function DailyPuzzle({
  puzzle,
  day,
  url,
  record = false,
  saved = null,
}: {
  puzzle: Pick<Puzzle, "id" | "fen" | "moves" | "alt" | "goal" | "rating">;
  day: string;
  url: string;
  /** A claimed player's device: report the outcome to the server. */
  record?: boolean;
  /** Today's outcome already stored for this player (from another device or an earlier visit). */
  saved?: { result: "solved" | "shown"; misses: number; hint: boolean } | null;
}) {
  const { t } = useT();
  const m = t.puzzle;
  const start = useMemo(() => parseFen(puzzle.fen), [puzzle.fen]);
  const side = start.turn;
  const key = `puzzle:${day}`;

  const [pos, setPos] = useState<Position>(start);
  const [ply, setPly] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [last, setLast] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("play");
  const [misses, setMisses] = useState(0);
  /** The square whose piece glows after "Hint", and whether any hint was used on this puzzle. */
  const [hint, setHint] = useState<string | null>(null);
  const [hinted, setHinted] = useState(false);
  const busy = useRef(false);
  /** The solver's own moves so far, sent with a "solved" so the server can check them. */
  const mine = useRef<string[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const done = status === "solved" || status === "shown";

  /** The board after the whole solution, for a puzzle finished earlier today on this device. */
  const finalBoard = () => {
    let p = start;
    for (const mv of puzzle.moves) p = playUci(p, mv);
    return p;
  };

  useEffect(() => {
    try {
      // The server's record wins (it follows the player to every device); else this device's own note:
      // "solved:<misses>", "solved:<misses>:h" after a hint, or "shown".
      const [local, missed, usedHint] = (localStorage.getItem(key) ?? "").split(":");
      const done = saved ?? (local === "solved" || local === "shown" ? { result: local, misses: Number(missed) || 0, hint: usedHint === "h" } : null);
      if (done) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setPos(finalBoard());
        setLast(puzzle.moves[puzzle.moves.length - 1]);
        setPly(puzzle.moves.length);
        setStatus(done.result);
        setMisses(done.misses);
        setHinted(done.hint);
      }
    } catch {
      /* no storage: the puzzle simply starts fresh */
    }
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const remember = (value: `solved:${number}` | `solved:${number}:h` | "shown") => {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* private window: fine, it just is not remembered */
    }
  };

  const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));

  /** Fire-and-forget: the board does not wait for the server, and a failed save just is not counted. */
  const report = (outcome: "solved" | "shown", misses: number, hint: boolean) => {
    if (!record || saved) return;
    void recordPuzzle(outcome, mine.current, misses, hint).catch(() => undefined);
  };

  const tryMove = (from: string, to: string) => {
    const expected = puzzle.moves[ply];
    const lastStep = ply === puzzle.moves.length - 1;
    // The promotion piece is not asked for: the solution's piece is taken, a queen otherwise.
    const uci = from + to + (isPromotion(pos, from, to) ? (expected.startsWith(from + to) ? expected.slice(4) || "q" : "q") : "");
    const correct = uci === expected || (lastStep && !!puzzle.alt?.includes(uci));
    setSelected(null);
    if (correct) setHint(null);
    if (!correct) {
      setMisses((n) => n + 1);
      setStatus("wrong");
      return;
    }
    const next = playUci(pos, uci);
    setPos(next);
    setLast(uci);
    mine.current = [...mine.current, uci];
    if (lastStep) {
      setPly(ply + 1);
      setStatus("solved");
      remember(hinted ? `solved:${misses}:h` : `solved:${misses}`);
      report("solved", misses, hinted);
      return;
    }
    setStatus("good");
    busy.current = true;
    later(() => {
      const reply = puzzle.moves[ply + 1];
      setPos((p) => playUci(p, reply));
      setLast(reply);
      setPly(ply + 2);
      busy.current = false;
    }, REPLY_MS);
  };

  const onSquare = (sq: string, index: number) => {
    if (done || busy.current) return;
    const piece = pos.squares[index];
    if (piece && piece.color === side) {
      setSelected(selected === sq ? null : sq);
      if (status === "wrong") setStatus("play");
      return;
    }
    if (selected) tryMove(selected, sq);
  };

  const showHint = () => {
    if (done || busy.current) return;
    setHint(puzzle.moves[ply].slice(0, 2));
    setHinted(true);
    setSelected(null);
    if (status === "wrong") setStatus("play");
  };

  const showSolution = () => {
    setHint(null);
    timers.current.forEach(clearTimeout);
    timers.current = [];
    busy.current = true;
    let p = start;
    setPos(start);
    setLast(null);
    setSelected(null);
    puzzle.moves.forEach((mv, i) => {
      later(() => {
        p = playUci(p, mv);
        setPos(p);
        setLast(mv);
        if (i === puzzle.moves.length - 1) busy.current = false;
      }, REPLY_MS * (i + 1));
    });
    setPly(puzzle.moves.length);
    setStatus("shown");
    remember("shown");
    report("shown", misses, hinted);
  };

  const startOver = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    busy.current = false;
    setPos(start);
    setPly(0);
    setLast(null);
    setSelected(null);
    setStatus("play");
    setMisses(0);
    setHint(null);
    setHinted(false);
    mine.current = [];
    try {
      localStorage.removeItem(key);
    } catch {
      /* nothing to forget */
    }
  };

  // The solver's side sits at the bottom.
  const order = side === "w" ? [...Array(64).keys()] : [...Array(64).keys()].reverse();
  const lastFrom = last?.slice(0, 2);
  const lastTo = last?.slice(2, 4);
  const message =
    status === "wrong"
      ? m.wrong
      : status === "solved"
        ? `${hinted ? m.solvedWithHint : plural(misses + 1, m.solved)} ${m.tomorrow}`
        : status === "shown"
          ? m.shown
          : hint
            ? m.hintShown
            : status === "good"
              ? m.keepGoing
              : m.yourMove;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
        <span className="font-medium">
          {m.toMove[side]} · {m.goal[puzzle.goal]}
        </span>
        <span className="text-xs text-muted font-mono">{fmt(m.rating, { n: puzzle.rating })}</span>
      </div>
      <div role="grid" aria-label={m.board} className="grid grid-cols-8 aspect-square w-full max-w-[22rem] mx-auto overflow-hidden rounded-lg border border-line select-none">
        {order.map((i) => {
          const sq = squareName(i);
          const piece = pos.squares[i];
          const dark = (Math.floor(i / 8) + (i % 8)) % 2 === 1;
          const isLast = sq === lastFrom || sq === lastTo;
          const isSel = sq === selected;
          const row = order.indexOf(i);
          const label = (piece ? `${sq}, ${m.colors[piece.color]} ${m.pieces[piece.type]}` : sq) + (sq === hint ? ` (${m.hint})` : "");
          return (
            <button
              key={sq}
              type="button"
              role="gridcell"
              aria-label={label}
              aria-selected={isSel}
              onClick={() => onSquare(sq, i)}
              className={`relative aspect-square ${dark ? "bg-[var(--sq-dark)]" : "bg-[var(--sq-light)]"} ${done ? "cursor-default" : "cursor-pointer"} focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2`}
            >
              {isLast && <span className="absolute inset-0 bg-accent/35" aria-hidden />}
              {isSel && <span className="absolute inset-0 ring-4 ring-inset ring-accent" aria-hidden />}
              {sq === hint && !isSel && <span className="absolute inset-0 ring-4 ring-inset ring-win/80 bg-win/20 animate-pulse" aria-hidden />}
              {status === "wrong" && isLast === false && sq === selected && <span className="absolute inset-0 bg-loss/30" aria-hidden />}
              {piece && <PieceSvg piece={piece} className="relative h-full w-full p-[6%]" />}
              {/* Coordinates along the solver's bottom edge and left edge, as on a printed diagram. */}
              {row % 8 === 0 && <span className={`absolute left-0.5 top-0 text-[9px] font-medium leading-none ${dark ? "text-[var(--sq-light)]" : "text-[var(--sq-dark)]"}`} aria-hidden>{sq[1]}</span>}
              {row >= 56 && <span className={`absolute right-0.5 bottom-0 text-[9px] font-medium leading-none ${dark ? "text-[var(--sq-light)]" : "text-[var(--sq-dark)]"}`} aria-hidden>{sq[0]}</span>}
            </button>
          );
        })}
      </div>
      <p role="status" aria-live="polite" className={`text-sm ${status === "wrong" ? "text-loss" : status === "solved" ? "text-win" : "text-muted"}`}>
        {message}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {!done && (
          <button type="button" className="btn btn-sm" onClick={showHint} disabled={!!hint}>
            {m.hint}
          </button>
        )}
        {!done && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={showSolution}>
            {m.showSolution}
          </button>
        )}
        {(ply > 0 || done || misses > 0 || hinted) && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={startOver}>
            {m.startOver}
          </button>
        )}
        <a href={url} target="_blank" rel="noopener noreferrer" className="ml-auto text-xs text-muted hover:text-accent" title={m.source}>
          {m.openLichess} →
        </a>
      </div>
    </div>
  );
}
