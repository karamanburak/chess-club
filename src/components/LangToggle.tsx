"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setLanguage } from "@/lib/actions";
import { LANGS, LANG_NAMES, type Lang } from "@/lib/i18n";
import { useT } from "./I18nProvider";

/** EN / DE switch in the header. Stores the choice in a cookie for this device and re-renders the page. */
export function LangToggle() {
  const { lang } = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const choose = (next: Lang) => {
    if (next === lang) return;
    start(async () => {
      await setLanguage(next);
      router.refresh();
    });
  };
  return (
    <div className={`inline-flex rounded-md border border-line text-xs font-medium overflow-hidden ${pending ? "opacity-60" : ""}`} role="group" aria-label="Language">
      {LANGS.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => choose(l)}
          title={LANG_NAMES[l]}
          aria-pressed={l === lang}
          className={`px-2 py-1 uppercase transition-colors ${l === lang ? "bg-panel-2 text-fg" : "text-muted hover:text-fg"}`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
