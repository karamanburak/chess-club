"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setLanguage } from "@/lib/actions";
import { LANGS, LANG_NAMES, type Lang } from "@/lib/i18n";
import { Icon } from "./icons";
import { useT } from "./I18nProvider";

type Theme = "dark" | "light";

/** Inline script for the root layout so the stored theme is applied before first paint. */
export const themeInitScript = `try{if(localStorage.getItem("theme")==="light")document.documentElement.setAttribute("data-theme","light")}catch(e){}`;

function applyTheme(theme: Theme) {
  if (theme === "light") document.documentElement.setAttribute("data-theme", "light");
  else document.documentElement.removeAttribute("data-theme");
}

/**
 * One quiet gear button in the header; the popover holds the two per-device preferences:
 * UI language (cookie, re-renders the page) and theme (localStorage, applied instantly).
 */
export function PrefsMenu() {
  const { t, lang } = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>("dark");
  const [pending, start] = useTransition();
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (localStorage.getItem("theme") === "light") setTheme("light");
    } catch {}
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const chooseLang = (next: Lang) => {
    if (next === lang) return;
    start(async () => {
      await setLanguage(next);
      router.refresh();
    });
  };
  const chooseTheme = (next: Theme) => {
    setTheme(next);
    applyTheme(next);
    try {
      localStorage.setItem("theme", next);
    } catch {}
  };

  const seg = (active: boolean) => `flex-1 rounded-md px-2.5 py-1.5 text-sm transition-colors ${active ? "bg-panel-2 text-fg font-medium" : "text-muted hover:text-fg"}`;

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`btn btn-sm btn-ghost ${open ? "bg-panel-2 text-fg" : ""}`}
        title={t.nav.preferences}
        aria-label={t.nav.preferences}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Icon name="settings" className="h-4 w-4" />
      </button>
      {open && (
        <div role="dialog" aria-label={t.nav.preferences} className={`absolute right-0 top-full mt-2 z-40 card p-3 w-60 flex flex-col gap-3 shadow-xl fade-up ${pending ? "opacity-70" : ""}`}>
          <div>
            <div className="label mb-1.5">{t.nav.language}</div>
            <div className="flex rounded-lg border border-line p-0.5" role="group" aria-label={t.nav.language}>
              {LANGS.map((l) => (
                <button key={l} type="button" onClick={() => chooseLang(l)} aria-pressed={l === lang} className={seg(l === lang)}>
                  {LANG_NAMES[l]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="label mb-1.5">{t.nav.theme}</div>
            <div className="flex rounded-lg border border-line p-0.5" role="group" aria-label={t.nav.theme}>
              <button type="button" onClick={() => chooseTheme("light")} aria-pressed={theme === "light"} className={`${seg(theme === "light")} inline-flex items-center justify-center gap-1.5`}>
                <Icon name="sun" className="h-3.5 w-3.5" /> {t.nav.light}
              </button>
              <button type="button" onClick={() => chooseTheme("dark")} aria-pressed={theme === "dark"} className={`${seg(theme === "dark")} inline-flex items-center justify-center gap-1.5`}>
                <Icon name="moon" className="h-3.5 w-3.5" /> {t.nav.dark}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
