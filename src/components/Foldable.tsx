"use client";

import { useState, type ReactNode } from "react";
import { Icon, type IconName } from "./icons";

/**
 * A card that is always open on desktop and folded on phones until tapped: for forms that would otherwise push
 * the lists below the fold on a small screen. Folded, it is one full-width primary button (the form is the page's
 * main action, so it must not look like a quiet card header). `defaultOpen` comes from the server, so server and
 * client agree on the first render.
 */
export function Foldable({
  title,
  openLabel,
  icon,
  defaultOpen = false,
  children,
}: {
  title: string;
  /** The button text while folded on a phone, e.g. "New challenge". */
  openLabel: string;
  icon?: IconName;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <>
      {!open && (
        <button type="button" onClick={() => setOpen(true)} aria-expanded={false} className="lg:hidden btn btn-primary w-full justify-center py-3">
          {icon && <Icon name={icon} className="h-4 w-4" />}
          {openLabel}
        </button>
      )}
      <section className={`card ${open ? "flex" : "hidden lg:flex"} flex-col`}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="card-title">{title}</h2>
          <button type="button" onClick={() => setOpen(false)} aria-expanded={open} aria-label={openLabel} className="lg:hidden btn btn-sm btn-ghost">
            <Icon name="chevron" className="h-4 w-4 rotate-180" />
          </button>
        </div>
        <div className="flex flex-1 min-h-0 flex-col">{children}</div>
      </section>
    </>
  );
}
