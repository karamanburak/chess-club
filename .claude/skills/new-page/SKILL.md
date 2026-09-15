---
name: new-page
description: Create or restructure a page under src/app/(site) following this repo's layout and visual conventions (server component, force-dynamic, PageHeader/Section/col-stack grid, ui.tsx primitives, icons instead of emoji, Nav entry). Use when adding a route, a tab, a new card/section to an existing page, or when a page's layout looks off.
---

# Adding a page or section

Pages are async server components under `src/app/(site)/<route>/page.tsx`. `src/app/(site)/layout.tsx` already provides Nav, the centered `main` and the footer; the page returns fragments only.

## Skeleton

```tsx
import { readDb } from "@/lib/db";
import { isAdmin } from "@/lib/auth";
import { getT } from "@/lib/lang";
import { fmt, plural } from "@/lib/i18n";
import { playerMap } from "@/lib/queries";
import { Empty, PageHeader, Section } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ThingPage({ params, searchParams }: PageProps<"/things/[id]">) {
  const { id } = await params;              // params and searchParams are Promises in Next 16
  const sp = await searchParams;
  const { t, lang } = await getT();          // every visible string comes from the dictionary
  const db = await readDb();                // request-cached; call it freely in nested components
  const admin = await isAdmin();
  const names = playerMap(db);
  // derive everything with functions from queries.ts / club.ts — no math in JSX

  return (
    <>
      <PageHeader eyebrow={t.things.eyebrow} title={t.things.title} subtitle={<span>{plural(n, t.common.gamesN)}</span>} actions={admin ? <Link href="…" className="btn">{t.things.manage}</Link> : undefined} />
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="col-stack">
          <Section title={t.things.main}>…</Section>
          <Section title={t.things.more}>…</Section>
        </div>
        <div className="col-stack">
          <Section title={t.things.side}>…</Section>
        </div>
      </div>
    </>
  );
}
```

## Conventions

- **Text**: no literal UI strings in JSX. Add a namespace file `src/lib/i18n/messages/<name>.ts` exporting `{ en, de }` (`de: typeof en`), register it in `src/lib/i18n/index.ts` (`build()`), and read it via `t.<name>.key`. Placeholders `{n}` with `fmt()`, plurals `{ one, other }` with `plural()`. Client components use `useT()` from `I18nProvider`. Dates through `formatDate(iso, lang)`. If `t` is taken (tournament pages), use `const { t: msg } = await getT()`.

- **Data**: read with `await readDb()`; compute with read models in `src/lib/queries.ts` / `src/lib/club.ts`. If a computation is new and non-trivial, put it there (pure, testable), not in the page.
- **Layout**: two columns = `grid gap-6 lg:grid-cols-[3fr_2fr]`; a column with several cards is `div.col-stack` so both columns end level. Single cards use `.card`; stat tiles use `.stat` / `.stat-label` / `.stat-value`.
- **Primitives from `ui.tsx`**: `PageHeader`, `Section`, `Empty`, `PlayerLink` (with `avatar`), `Avatar`, `Rank`, `RatingDelta`, `ResultChip`, `StatusBadge`, `Pill`, `TitleBadge`, `StreakBadge`, `FormDots`. Check there before writing a new badge. `ui.tsx` is server-only (`Avatar` reads the db); do not import it from a `"use client"` file.
- **Type**: `font-display` for h1 and card titles only; body is the default Geist. Muted text `text-muted`, accents `text-accent`, results `text-win`/`text-loss`/`text-draw`.
- **Icons**: `Icon name="…"` and `KnightMark` from `src/components/icons.tsx`. No emoji or unicode chess glyphs in chrome (labels, buttons, headers). Emoji inside `Empty` icons is legacy; prefer an `Icon`. No `<title>` inside SVGs; use `aria-label`.
- **Interactivity**: keep the page a server component; put the interactive island in `src/components/*.tsx` with `"use client"` and call an `attempt()`-wrapped action (see `new-action` skill). Forms post to `run()` actions; a `UserError` comes back as `?flash=` and the root layout's `Flash` shows it as a toast, so pages never render their own error UI for form actions.
- **Empty states**: every list gets an `Empty` with a one-line hint of what to do.
- **Access**: pages under `/admin` call `await requireAdmin()`-guarded actions; the page itself decides what to show with `isAdmin()`. Member gating is handled by `src/proxy.ts`, do not re-implement it.
- **Nav**: a top-level route gets an entry in the `links` array in `src/components/Nav.tsx` (icon name from `icons.tsx`). Sub-pages do not.
- **Route types**: after adding a route run `bun run build` (or `bunx next typegen`) so `PageProps<"/…">` resolves; `tsc` fails until then.
- **Printing/TV**: mark chrome that should not print with `no-print`.

Finish with the `check` skill; for a visual pass use the `seed-demo` skill and open the page on port 3001.
