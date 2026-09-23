"use client";

import { useOptimistic, useState, useTransition } from "react";
import { setGameResult, swapColors } from "@/lib/actions";
import type { GameResult } from "@/lib/types";
import { useToast } from "./Toast";
import { useT } from "./I18nProvider";
import { fmt } from "@/lib/i18n";

const main: { value: GameResult; label: string; title: "whiteWins" | "draw" | "blackWins" }[] = [
  { value: "1-0", label: "1–0", title: "whiteWins" },
  { value: "1/2-1/2", label: "½", title: "draw" },
  { value: "0-1", label: "0–1", title: "blackWins" },
];
const extra: { value: GameResult; label: string; title: "blackForfeit" | "whiteForfeit"; absent: "blackAbsent" | "whiteAbsent" }[] = [
  { value: "+/-", label: "+ / –", title: "blackForfeit", absent: "blackAbsent" },
  { value: "-/+", label: "– / +", title: "whiteForfeit", absent: "whiteAbsent" },
];

export function ResultButtons({
  gameId,
  current,
  disabled,
  size = "sm",
  names,
  allowSwap,
  allowClear = true,
}: {
  gameId: string;
  current: GameResult | null;
  disabled?: boolean;
  size?: "sm" | "lg";
  /** Used for the toast text. */
  names?: { white: string; black: string };
  allowSwap?: boolean;
  /** False for friendlies: a recorded game keeps a result, clicking the active one does nothing. */
  allowClear?: boolean;
}) {
  const [value, setOptimistic] = useOptimistic(current);
  const [pending, start] = useTransition();
  const [menu, setMenu] = useState(false);
  const toast = useToast();
  const { t } = useT();

  const choose = (next: GameResult | null) => {
    const prev = value;
    const target = value === next ? null : next;
    setMenu(false);
    if (target === null && !allowClear) return;
    start(async () => {
      setOptimistic(target);
      const res = await setGameResult(gameId, target);
      if (res.error) {
        toast.push({ text: res.error, tone: "error" });
        return;
      }
      if (names) {
        const label = target ? (target === "1/2-1/2" ? t.pairing.draw : fmt(t.pairing.nameWins, { name: target === "1-0" || target === "+/-" ? names.white : names.black })) : t.pairing.resultCleared;
        toast.push({
          text: `${label} · ${names.white} – ${names.black}`,
          tone: "ok",
          undo: async () => {
            const back = await setGameResult(gameId, prev);
            if (back.error) toast.push({ text: back.error, tone: "error" });
          },
        });
      }
    });
  };

  const base = size === "lg" ? "px-4 py-2.5 text-base rounded-xl min-w-16" : "px-2.5 py-1.5 text-xs rounded-md min-w-11";
  const isForfeit = value === "+/-" || value === "-/+";

  return (
    <div className={`relative inline-flex items-center gap-1 transition-opacity ${pending ? "opacity-60" : ""}`} role="group" aria-label={t.common.result}>
      {main.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            disabled={disabled}
            title={active && allowClear ? t.pairing.clickToClear : t.pairing[o.title]}
            onClick={() => choose(o.value)}
            aria-pressed={active}
            className={`font-mono font-medium border transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 ${base} ${
              active
                ? "bg-accent text-accent-fg border-accent"
                : value
                  ? "bg-transparent text-muted border-transparent hover:border-line"
                  : "bg-panel-2 text-fg border-line hover:bg-panel-3"
            }`}
          >
            {o.label}
          </button>
        );
      })}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setMenu((m) => !m)}
        title={t.pairing.forfeitMore}
        className={`font-mono border transition-all cursor-pointer disabled:opacity-40 ${base} ${isForfeit ? "bg-accent text-accent-fg border-accent" : "bg-transparent text-muted border-transparent hover:border-line"}`}
      >
        {isForfeit ? (value === "+/-" ? "+/–" : "–/+") : "⋯"}
      </button>
      {menu && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setMenu(false)} />
          <div className="absolute right-0 top-full mt-1 z-40 card p-1.5 min-w-56 flex flex-col gap-0.5 shadow-xl fade-up">
            {extra.map((o) => (
              <button key={o.value} type="button" onClick={() => choose(o.value)} className="btn btn-sm btn-ghost justify-start" title={t.pairing[o.title]}>
                <span className="font-mono w-10 text-left">{o.label}</span>
                <span className="text-muted">{t.pairing[o.absent]}</span>
              </button>
            ))}
            {allowSwap && !value && (
              <button
                type="button"
                className="btn btn-sm btn-ghost justify-start"
                onClick={() => {
                  setMenu(false);
                  start(async () => {
                    const res = await swapColors(gameId);
                    toast.push(res.error ? { text: res.error, tone: "error" } : { text: t.pairing.colorsSwapped, tone: "info" });
                  });
                }}
              >
                <span className="w-10 text-left">⇄</span>
                <span className="text-muted">{t.pairing.swapColors}</span>
              </button>
            )}
            {value && allowClear && (
              <button type="button" className="btn btn-sm btn-ghost justify-start" onClick={() => choose(null)}>
                <span className="w-10 text-left">×</span>
                <span className="text-muted">{t.pairing.clearResult}</span>
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
