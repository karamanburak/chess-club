"use client";

import { useRouter } from "next/navigation";

/**
 * The months beyond the recent chips on /games, as one dropdown, so the filter row stays one line however long the
 * club has been playing. Each option already carries its target address (built on the server with the other filters).
 */
export function MonthSelect({ options, value, label, placeholder }: { options: { value: string; label: string; href: string }[]; value: string; label: string; placeholder: string }) {
  const router = useRouter();
  const selected = options.some((o) => o.value === value);
  return (
    <select
      aria-label={label}
      value={selected ? value : ""}
      onChange={(e) => {
        const o = options.find((x) => x.value === e.target.value);
        if (o) router.push(o.href);
      }}
      className={`h-8 py-0 text-sm sm:text-sm ${selected ? "border-accent text-fg" : "text-muted"}`}
    >
      <option value="" disabled>
        {placeholder}
      </option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
