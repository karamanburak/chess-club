"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { FaceSvg } from "./Face";
import { Icon } from "./icons";
import { useT } from "./I18nProvider";

export interface Seat {
  id: string;
  name: string;
  avatar: string;
}

export interface RevealBoard {
  board: number;
  white: Seat;
  black: Seat;
}

/**
 * Plays once, right after a round has been generated, in front of the real board list.
 *
 * - "draw": the pairing really was random (club night, random-mode tournament). Names spin
 *   through the pool and lock in board by board, like a live draw.
 * - "reveal": the pairing was computed (Swiss, round robin, knockout). Boards simply appear one
 *   after another, so nobody mistakes a rating-based pairing for luck.
 *
 * `active` is true only when the page was reached with `?reveal=<round>` straight from the
 * action; the component strips that query on mount so a refresh shows the boards directly.
 * Respects prefers-reduced-motion and has a Skip button; the children (real boards with result
 * buttons) render only when the animation is over, so nothing can be clicked by accident.
 */
export function PairingReveal({ active, mode, boards, bye, children }: { active: boolean; mode: "draw" | "reveal"; boards: RevealBoard[]; bye?: Seat | null; children: ReactNode }) {
  const { t } = useT();
  const [phase, setPhase] = useState<"running" | "done">(active ? "running" : "done");
  // Number of boards already locked in (draw) or shown (reveal).
  const [locked, setLocked] = useState(0);
  const [tick, setTick] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const pool = useMemo(() => {
    const seats = boards.flatMap((b) => [b.white, b.black]);
    return bye ? [...seats, bye] : seats;
  }, [boards, bye]);

  const stepMs = mode === "draw" ? 650 : 320;
  const total = boards.length + (bye ? 1 : 0);

  useEffect(() => {
    if (phase !== "running") return;
    // Drop the ?reveal=... marker so a refresh or back-navigation does not replay the show.
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has("reveal")) {
        url.searchParams.delete("reveal");
        window.history.replaceState(window.history.state, "", url.pathname + (url.search ? url.search : "") + url.hash);
      }
    } catch {
      /* ignore */
    }
    const t = timers.current;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || total === 0) {
      t.push(setTimeout(() => setPhase("done"), 0));
      return () => {
        t.forEach(clearTimeout);
        t.length = 0;
      };
    }
    for (let i = 1; i <= total; i++) t.push(setTimeout(() => setLocked(i), 500 + i * stepMs));
    t.push(setTimeout(() => setPhase("done"), 500 + total * stepMs + 900));
    return () => {
      t.forEach(clearTimeout);
      t.length = 0;
    };
  }, [phase, total, stepMs]);

  // Name flicker for boards that are not locked yet.
  useEffect(() => {
    if (phase !== "running" || mode !== "draw" || locked >= boards.length) return;
    const id = setInterval(() => setTick((x) => x + 1), 90);
    return () => clearInterval(id);
  }, [phase, mode, locked, boards.length]);

  if (phase === "done") return <div className="fade-up">{children}</div>;

  const spin = (offset: number): Seat => pool[(tick * 7 + offset * 3) % pool.length];

  return (
    <div className="relative" aria-live="polite" aria-busy>
      <div className="flex items-center justify-between gap-3 px-1 pb-3 no-print">
        <span className="flex items-center gap-2 text-sm text-muted">
          <Icon name="shuffle" className={`h-4 w-4 text-accent ${locked < total ? "animate-spin [animation-duration:1.6s]" : ""}`} />
          {mode === "draw" ? (locked < boards.length ? t.common.reveal.drawing : t.common.reveal.drawn) : locked < total ? t.common.reveal.settingUp : t.common.reveal.ready}
        </span>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setPhase("done")}>
          {t.common.skip}
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 content-start">
        {boards.map((b, i) => {
          const isLocked = i < locked;
          if (mode === "reveal" && !isLocked) return <div key={b.board} className="card min-h-20 border-dashed opacity-40" aria-hidden />;
          const white = isLocked ? b.white : spin(i * 2);
          const black = isLocked ? b.black : spin(i * 2 + 1);
          return (
            <div key={b.board} className={`card flex items-center gap-3 ${isLocked ? "reveal-pop border-accent/50" : "border-dashed"}`}>
              <span className="font-mono text-muted text-sm w-6 shrink-0">{b.board}</span>
              <SeatView seat={white} color="white" locked={isLocked} />
              <span className="text-muted text-xs font-mono shrink-0">vs</span>
              <SeatView seat={black} color="black" locked={isLocked} align="right" />
            </div>
          );
        })}
        {bye &&
          (locked > boards.length ? (
            <div className="card border-dashed flex items-center gap-3 text-muted reveal-pop">
              <FaceSvg seed={bye.avatar} className="h-9 w-9 rounded-full" />
              <div className="text-sm">
                <span className="font-medium text-fg">{bye.name}</span>
                <div className="text-xs">{t.common.reveal.sitsOutRound}</div>
              </div>
            </div>
          ) : (
            <div className="card min-h-20 border-dashed opacity-40" aria-hidden />
          ))}
      </div>
    </div>
  );
}

function SeatView({ seat, color, locked, align = "left" }: { seat: Seat; color: "white" | "black"; locked: boolean; align?: "left" | "right" }) {
  return (
    <span className={`flex items-center gap-2 min-w-0 flex-1 ${align === "right" ? "flex-row-reverse text-right" : ""}`}>
      <span className={`relative shrink-0 ${locked ? "" : "opacity-60 blur-[0.5px]"}`}>
        <FaceSvg seed={seat.avatar} className="h-9 w-9 rounded-full" />
        <span className={`absolute -bottom-0.5 ${align === "right" ? "-left-0.5" : "-right-0.5"} h-3 w-3 rounded-full border border-line ${color === "white" ? "bg-white" : "bg-black"}`} />
      </span>
      <span className={`truncate text-sm ${locked ? "font-medium text-fg" : "text-muted"}`}>{seat.name}</span>
    </span>
  );
}
