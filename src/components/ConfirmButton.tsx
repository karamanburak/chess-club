"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";

/**
 * Two-step destructive action: first click arms it, second click runs the action.
 * Disarms itself after a few seconds.
 */
export function ConfirmButton({
  action,
  children,
  confirmLabel = "Yes, do it",
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
  const [armed, setArmed] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 5000);
    return () => clearTimeout(t);
  }, [armed]);

  if (!armed) {
    return (
      <button type="button" className={className} disabled={disabled || pending} title={title} onClick={() => setArmed(true)}>
        {children}
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 fade-up">
      <button
        type="button"
        className="btn btn-sm bg-loss/90 border-loss text-white hover:bg-loss"
        disabled={pending}
        onClick={() =>
          start(async () => {
            await action();
            setArmed(false);
          })
        }
      >
        {pending ? "…" : confirmLabel}
      </button>
      <button type="button" className="btn btn-sm btn-ghost" onClick={() => setArmed(false)} disabled={pending}>
        Cancel
      </button>
    </span>
  );
}
