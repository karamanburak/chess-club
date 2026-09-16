"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useT } from "./I18nProvider";

/** Debounced search input bound to the `q` query parameter. */
export function SearchBox({ placeholder }: { placeholder?: string }) {
  const { t } = useT();
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const [value, setValue] = useState(params.get("q") ?? "");

  useEffect(() => {
    // Only act when the typed value differs from the URL. Otherwise every navigation (e.g. to ?page=2)
    // re-ran this effect and the `page` reset below threw the visitor back to page 1.
    if ((params.get("q") ?? "") === value) return;
    const timer = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (value) next.set("q", value);
      else next.delete("q");
      next.delete("page");
      const qs = next.toString();
      if (qs !== params.toString()) router.replace(qs ? `${path}?${qs}` : path);
    }, 250);
    return () => clearTimeout(timer);
  }, [value, params, path, router]);

  return (
    <input
      type="search"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      placeholder={placeholder ?? t.players.search.placeholder}
      className="w-full sm:w-64"
      aria-label={t.players.search.label}
    />
  );
}
