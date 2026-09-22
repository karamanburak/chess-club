"use client";

import { Icon } from "./icons";

/**
 * Fills the date and time fields of the surrounding form with the device's current minute. Only fills: the
 * member still completes place and time control and presses Send, so nothing is skipped.
 */
export function NowButton({ label, title, className = "btn btn-sm btn-ghost" }: { label: string; title: string; className?: string }) {
  const two = (n: number) => String(n).padStart(2, "0");
  return (
    <button
      type="button"
      className={className}
      title={title}
      onClick={(e) => {
        const form = e.currentTarget.form;
        if (!form) return;
        const now = new Date();
        const date = form.elements.namedItem("date") as HTMLInputElement | null;
        const time = form.elements.namedItem("time") as HTMLInputElement | null;
        if (date) date.value = `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
        if (time) time.value = `${two(now.getHours())}:${two(now.getMinutes())}`;
        // Move on to the first empty required field, so the flow reads "now → where → tempo → send".
        const next = [...form.querySelectorAll<HTMLInputElement>("input[required]")].find((i) => !i.value);
        next?.focus();
      }}
    >
      <Icon name="clock" className="h-3.5 w-3.5" /> {label}
    </button>
  );
}
