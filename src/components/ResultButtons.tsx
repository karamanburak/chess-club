"use client";

import { useEffect, useId, useOptimistic, useRef, useState, useTransition, type KeyboardEvent } from "react";
import { Icon } from "./icons";
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
  const [menu, setMenuState] = useState(false);
  const toast = useToast();
  const { t } = useT();
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  /** Opens or closes the forfeit menu; closing with `refocus` hands focus back to its button. */
  const setMenu = (open: boolean, refocus = false) => {
    setMenuState(open);
    if (!open && refocus) triggerRef.current?.focus();
  };

  // Opening moves focus to the first item.
  useEffect(() => {
    if (menu) menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [menu]);

  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const at = items.indexOf(document.activeElement as HTMLElement);
    const go = (i: number) => {
      e.preventDefault();
      items[(i + items.length) % items.length]?.focus();
    };
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setMenu(false, true);
    } else if (e.key === "ArrowDown") go(at + 1);
    else if (e.key === "ArrowUp") go(at - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(items.length - 1);
    else if (e.key === "Tab") setMenu(false);
  };

  const choose = (next: GameResult | null) => {
    const prev = value;
    const target = value === next ? null : next;
    setMenu(false, true);
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
            aria-label={t.pairing[o.title]}
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
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setMenu(!menu, menu)}
        title={t.pairing.forfeitMore}
        aria-label={isForfeit ? `${t.pairing[value === "+/-" ? "blackForfeit" : "whiteForfeit"]} · ${t.pairing.forfeitMore}` : t.pairing.forfeitMore}
        aria-haspopup="menu"
        aria-expanded={menu}
        aria-controls={menu ? menuId : undefined}
        className={`inline-flex items-center justify-center font-mono border transition-all cursor-pointer disabled:opacity-40 ${base} ${isForfeit ? "bg-accent text-accent-fg border-accent" : "bg-transparent text-muted border-transparent hover:border-line"}`}
      >
        {isForfeit ? (value === "+/-" ? "+/–" : "–/+") : <Icon name="more" className="h-4 w-4" />}
      </button>
      {menu && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setMenu(false, true)} aria-hidden />
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={t.pairing.forfeitMore}
            onKeyDown={onMenuKey}
            className="absolute right-0 top-full mt-1 z-40 card p-1.5 min-w-56 flex flex-col gap-0.5 shadow-xl fade-up"
          >
            {extra.map((o) => (
              <button key={o.value} type="button" role="menuitem" tabIndex={-1} onClick={() => choose(o.value)} className="btn btn-sm btn-ghost justify-start" title={t.pairing[o.title]}>
                <span className="font-mono w-10 text-left" aria-hidden>{o.label}</span>
                <span className="text-muted">{t.pairing[o.absent]}</span>
              </button>
            ))}
            {allowSwap && !value && (
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                className="btn btn-sm btn-ghost justify-start"
                onClick={() => {
                  setMenu(false, true);
                  start(async () => {
                    const res = await swapColors(gameId);
                    toast.push(res.error ? { text: res.error, tone: "error" } : { text: t.pairing.colorsSwapped, tone: "info" });
                  });
                }}
              >
                <span className="w-10 text-left" aria-hidden>
                  <Icon name="swap" className="h-4 w-4" />
                </span>
                <span className="text-muted">{t.pairing.swapColors}</span>
              </button>
            )}
            {value && allowClear && (
              <button type="button" role="menuitem" tabIndex={-1} className="btn btn-sm btn-ghost justify-start" onClick={() => choose(null)}>
                <span className="w-10 text-left" aria-hidden>
                  <Icon name="close" className="h-4 w-4" />
                </span>
                <span className="text-muted">{t.pairing.clearResult}</span>
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
