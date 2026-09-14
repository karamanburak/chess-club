"use client";

import { useEffect, useState } from "react";
import { Icon } from "./icons";

type Theme = "dark" | "light";

function apply(theme: Theme) {
  if (theme === "light") document.documentElement.setAttribute("data-theme", "light");
  else document.documentElement.removeAttribute("data-theme");
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");
  useEffect(() => {
    const stored = (typeof window !== "undefined" && (localStorage.getItem("theme") as Theme | null)) || null;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored === "light") setTheme("light");
  }, []);
  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    apply(next);
    try {
      localStorage.setItem("theme", next);
    } catch {}
  };
  return (
    <button type="button" onClick={toggle} className="btn btn-sm btn-ghost text-base leading-none" title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}>
      <Icon name={theme === "dark" ? "sun" : "moon"} className="h-4 w-4" />
    </button>
  );
}

/** Inline script so the stored theme is applied before first paint. */
export const themeInitScript = `try{if(localStorage.getItem("theme")==="light")document.documentElement.setAttribute("data-theme","light")}catch(e){}`;
