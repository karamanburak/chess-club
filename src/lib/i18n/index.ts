/**
 * Two UI languages, English and German, from one typed dictionary.
 *
 * - Every namespace lives in `messages/<name>.ts` and exports `{ en, de }` where `de` is typed
 *   `typeof en`, so a missing German string fails `tsc`.
 * - Values are plain strings (they cross the server → client boundary); placeholders are `{name}`
 *   and are filled with `fmt()`. Plurals are separate keys (`one` / `other`).
 * - Server code reads the language with `getT()` from `src/lib/lang.ts`; client components use
 *   `useT()` from `src/components/I18nProvider.tsx`.
 * - The language is a per-device cookie (`cc_lang`), falling back to `settings.language` (club default), then English.
 */
import { admin } from "./messages/admin";
import { challenges } from "./messages/challenges";
import { club } from "./messages/club";
import { common } from "./messages/common";
import { errors } from "./messages/errors";
import { games } from "./messages/games";
import { hall } from "./messages/hall";
import { home } from "./messages/home";
import { me } from "./messages/me";
import { nav } from "./messages/nav";
import { pairing } from "./messages/pairing";
import { players } from "./messages/players";
import { stats } from "./messages/stats";
import { tournaments } from "./messages/tournaments";
import { tv } from "./messages/tv";

export type Lang = "en" | "de";
export const LANGS: readonly Lang[] = ["en", "de"];
export const DEFAULT_LANG: Lang = "en";
export const LANG_COOKIE = "cc_lang";
export const LANG_NAMES: Record<Lang, string> = { en: "English", de: "Deutsch" };

function build(lang: Lang) {
  return {
    common: common[lang],
    nav: nav[lang],
    home: home[lang],
    tournaments: tournaments[lang],
    pairing: pairing[lang],
    players: players[lang],
    games: games[lang],
    stats: stats[lang],
    hall: hall[lang],
    admin: admin[lang],
    me: me[lang],
    errors: errors[lang],
    club: club[lang],
    tv: tv[lang],
    challenges: challenges[lang],
  };
}

export type Dict = ReturnType<typeof build>;
export const dicts: Record<Lang, Dict> = { en: build("en"), de: build("de") };

export function isLang(x: unknown): x is Lang {
  return x === "en" || x === "de";
}

export function pickLang(...candidates: (string | undefined | null)[]): Lang {
  for (const c of candidates) if (isLang(c)) return c;
  return DEFAULT_LANG;
}

/** Fills `{name}` placeholders: fmt("Round {n} of {total}", { n: 2, total: 5 }). */
export function fmt(template: string, vars: Record<string, string | number | null | undefined>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (vars[k] === null || vars[k] === undefined ? "" : String(vars[k])));
}

/** Picks the singular or plural form: plural(n, t.common.games) with { one: "{n} game", other: "{n} games" }. */
export function plural(n: number, forms: { one: string; other: string }): string {
  return fmt(n === 1 ? forms.one : forms.other, { n });
}

/** BCP 47 tag for Intl formatting. */
export function localeOf(lang: Lang): string {
  return lang === "de" ? "de-DE" : "en-GB";
}
