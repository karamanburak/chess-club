import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { readDb } from "./db";
import { dicts, LANG_COOKIE, pickLang, type Dict, type Lang } from "./i18n";

/** The language for this request: device cookie, else the club default, else English. Cached per request. */
export const currentLang = cache(async (): Promise<Lang> => {
  const jar = await cookies();
  const db = await readDb();
  return pickLang(jar.get(LANG_COOKIE)?.value, db.settings.language);
});

/** `const { t, lang } = await getT();` in server components and actions. */
export async function getT(): Promise<{ t: Dict; lang: Lang }> {
  const lang = await currentLang();
  return { t: dicts[lang], lang };
}
