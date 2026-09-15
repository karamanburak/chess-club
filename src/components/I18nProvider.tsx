"use client";

import { createContext, useContext, type ReactNode } from "react";
import { dicts, type Dict, type Lang } from "@/lib/i18n";

const Ctx = createContext<{ lang: Lang; t: Dict }>({ lang: "en", t: dicts.en });

/** Mounted once in the root layout with the request's language; client components read it with useT(). */
export function I18nProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  return <Ctx.Provider value={{ lang, t: dicts[lang] }}>{children}</Ctx.Provider>;
}

export function useT() {
  return useContext(Ctx);
}
