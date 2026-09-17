"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { useT } from "./I18nProvider";

/**
 * Two-step destructive action: first click arms it, second click runs the action.
 * Disarms itself after a few seconds. With `password`, the armed state also asks for a
 * secret (the owner password) and passes it to the action as its last argument.
 */
export function ConfirmButton({
  action,
  children,
  confirmLabel,
  className = "btn btn-danger",
  disabled,
  title,
  password,
}: {
  action: (secret?: string) => Promise<void>;
  children: ReactNode;
  confirmLabel?: string;
  className?: string;
  disabled?: boolean;
  title?: string;
  /** Placeholder of the password field; when set, the field is shown while armed and required. */
  password?: string;
}) {
  const { t } = useT();
  const [armed, setArmed] = useState(false);
  const [secret, setSecret] = useState("");
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), password ? 20000 : 5000);
    return () => clearTimeout(timer);
  }, [armed, password]);

  const fire = () =>
    start(async () => {
      await action(password ? secret : undefined);
      setArmed(false);
      setSecret("");
    });

  if (!armed) {
    return (
      <button type="button" className={className} disabled={disabled || pending} title={title} onClick={() => setArmed(true)}>
        {children}
      </button>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 fade-up">
      {password && (
        <input
          type="password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && secret && fire()}
          placeholder={password}
          aria-label={password}
          autoFocus
          autoComplete="off"
          className="w-36 text-sm py-1"
        />
      )}
      <button type="button" className="btn btn-sm btn-confirm" disabled={pending || (!!password && !secret)} onClick={fire}>
        {pending ? "…" : (confirmLabel ?? t.pairing.confirmDefault)}
      </button>
      <button type="button" className="btn btn-sm btn-ghost" onClick={() => setArmed(false)} disabled={pending}>
        {t.common.cancel}
      </button>
    </span>
  );
}
