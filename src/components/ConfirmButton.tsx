"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useT } from "./I18nProvider";
import { fmt } from "@/lib/i18n";

/** How long the armed state waits for the second click; paused while the pointer or focus is on it. */
const ARMED_MS = 15_000;

/**
 * Two-step destructive action: first click arms it, second click runs the action.
 * Disarms itself after a while (never while hovered or focused); the armed state is announced.
 */
export function ConfirmButton({
  action,
  children,
  confirmLabel,
  className = "btn btn-danger",
  disabled,
  title,
}: {
  action: () => Promise<void>;
  children: ReactNode;
  confirmLabel?: string;
  className?: string;
  disabled?: boolean;
  title?: string;
}) {
  const { t } = useT();
  const [armed, setArmed] = useState(false);
  const [pending, start] = useTransition();
  const [hold, setHold] = useState({ hover: false, focus: false });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const wasArmed = useRef(false);
  const held = hold.hover || hold.focus;

  useEffect(() => {
    if (!armed || held) return;
    const timer = setTimeout(() => setArmed(false), ARMED_MS);
    return () => clearTimeout(timer);
  }, [armed, held]);

  // Arming moves focus to the confirm button; disarming hands it back.
  useEffect(() => {
    if (armed) confirmRef.current?.focus();
    if (!armed && wasArmed.current && document.activeElement === document.body) triggerRef.current?.focus();
    wasArmed.current = armed;
  }, [armed]);

  const disarm = () => {
    setArmed(false);
    setHold({ hover: false, focus: false });
  };
  const label = confirmLabel ?? t.pairing.confirmDefault;

  const fire = () =>
    start(async () => {
      await action();
      disarm();
    });

  // Always mounted, so screen readers notice when the text appears.
  const live = (
    <span className="sr-only" role="status" aria-live="polite">
      {armed ? fmt(t.common.confirmArmed, { label }) : ""}
    </span>
  );

  if (!armed) {
    return (
      <>
        {live}
        <button ref={triggerRef} type="button" className={className} disabled={disabled || pending} title={title} onClick={() => setArmed(true)}>
          {children}
        </button>
      </>
    );
  }
  return (
    <>
      {live}
      <span
        className="inline-flex flex-wrap items-center gap-1.5 fade-up"
        onMouseEnter={() => setHold((h) => ({ ...h, hover: true }))}
        onMouseLeave={() => setHold((h) => ({ ...h, hover: false }))}
        onFocus={() => setHold((h) => ({ ...h, focus: true }))}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHold((h) => ({ ...h, focus: false }));
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape" && !pending) {
            e.stopPropagation();
            disarm();
          }
        }}
      >
        <button ref={confirmRef} type="button" className="btn btn-sm btn-confirm" disabled={pending} onClick={fire}>
          {pending ? "…" : label}
        </button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={disarm} disabled={pending}>
          {t.common.cancel}
        </button>
      </span>
    </>
  );
}
