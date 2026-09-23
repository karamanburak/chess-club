"use client";

import { useState, type ReactNode } from "react";
import { Icon } from "./icons";

/**
 * A card that is always open on desktop and folded on phones until tapped: for forms that would otherwise push
 * the lists below the fold on a small screen. Starts closed on every render, so server and client agree.
 */
export function Foldable({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="card flex flex-col">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="lg:hidden flex w-full items-center justify-between gap-3 text-left"
      >
        <span className="card-title">{title}</span>
        <span className="inline-flex items-center gap-2 text-xs text-muted">
          {hint && !open && <span>{hint}</span>}
          <Icon name="chevron" className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </span>
      </button>
      <div className="hidden lg:flex mb-4 items-center justify-between gap-3">
        <h2 className="card-title">{title}</h2>
      </div>
      <div className={`${open ? "mt-4 flex" : "hidden"} lg:mt-0 lg:flex flex-1 min-h-0 flex-col`}>{children}</div>
    </section>
  );
}
