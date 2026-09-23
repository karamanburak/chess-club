import Link from "next/link";
import { Suspense } from "react";
import { readDb } from "@/lib/db";
import { isAdmin } from "@/lib/auth";
import { getT } from "@/lib/lang";
import { fmt, plural } from "@/lib/i18n";
import { deleteGame } from "@/lib/actions";
import { completedGames, formatDateTime, formatMonth, monthsWithGames, playerMap, resultLabel } from "@/lib/queries";
import { ConfirmButton } from "@/components/ConfirmButton";
import { ResultButtons } from "@/components/ResultButtons";
import { MonthSelect } from "@/components/MonthSelect";
import { SearchBox } from "@/components/SearchBox";
import { Empty, PageHeader, PlayerLink, RatingDelta, Section } from "@/components/ui";
import { localMonth } from "@/lib/time";

export const dynamic = "force-dynamic";
const PAGE = 50;
/** Recent months shown as buttons; older ones go into one dropdown, so the row never grows. */
const MONTH_CHIPS = 3;

export default async function GamesPage({ searchParams }: PageProps<"/games">) {
  const sp = await searchParams;
  const { t, lang } = await getT();
  const db = await readDb();
  const admin = await isAdmin();
  const names = playerMap(db);
  const tournaments = new Map(db.tournaments.map((t) => [t.id, t]));
  const q = (typeof sp.q === "string" ? sp.q : "").toLowerCase();
  const kind = typeof sp.kind === "string" ? sp.kind : "all";
  const month = typeof sp.month === "string" ? sp.month : "";
  const page = Math.max(1, Number(sp.page) || 1);

  let games = completedGames(db);
  if (q) games = games.filter((g) => [g.whiteId, g.blackId].some((id) => (names.get(id)?.name ?? "").toLowerCase().includes(q)));
  if (kind === "tournament") games = games.filter((g) => g.tournamentId);
  if (kind === "night") games = games.filter((g) => g.sessionId);
  if (kind === "friendly") games = games.filter((g) => !g.tournamentId && !g.sessionId);
  // Months in club time: a game finished at 00:30 on 1 October (Berlin) belongs to October, not to September in UTC.
  if (month) games = games.filter((g) => !!g.completedAt && localMonth(new Date(g.completedAt)) === month);
  const total = games.length;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  games = games.slice((page - 1) * PAGE, page * PAGE);

  const months = monthsWithGames(db);
  const monthLabel = (m: string) => `${formatMonth(m, lang).slice(0, 3)} ${m.slice(0, 4)}`;

  const link = (over: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    const all = { q, kind, month, page: 1, ...over };
    for (const [k, v] of Object.entries(all)) if (v && String(v) !== "all" && !(k === "page" && v === 1)) p.set(k, String(v));
    const s = p.toString();
    return s ? `/games?${s}` : "/games";
  };

  /** What both layouts need per game: names, who won, and the event cell. */
  const row = (g: (typeof games)[number]) => {
    const tr = g.tournamentId ? tournaments.get(g.tournamentId) : null;
    return {
      tr,
      /** The admin corrects friendlies here; tournament and club-night boards have their own pages. */
      fix: admin && !g.tournamentId && !g.sessionId,
      ww: g.result === "1-0" || g.result === "+/-",
      bw: g.result === "0-1" || g.result === "-/+",
      wn: names.get(g.whiteId)?.name ?? "?",
      bn: names.get(g.blackId)?.name ?? "?",
      event: (
        <>
          {tr ? (
            <Link href={`/tournaments/${tr.id}`} className="hover:text-accent">
              {tr.name} · {fmt(t.games.roundShort, { n: g.round })}
            </Link>
          ) : g.sessionId ? (
            <Link href={`/pairing/${g.sessionId}`} className="hover:text-accent">
              {t.common.clubNight}
            </Link>
          ) : (
            t.games.friendly
          )}
          {!g.rated && <span className="ml-1 badge border-muted/40">{t.common.unrated}</span>}
        </>
      ),
    };
  };

  return (
    <>
      <PageHeader
        eyebrow={t.games.eyebrow}
        title={t.games.title}
        subtitle={<span>{plural(total, q || kind !== "all" || month ? t.games.countMatch : t.games.countAll)}</span>}
        actions={
          <Suspense>
            <SearchBox placeholder={t.games.searchPlaceholder} />
          </Suspense>
        }
      />
      <div className="flex flex-wrap items-center gap-2 mb-4 no-print">
        {[
          ["all", t.games.filterAll],
          ["night", t.games.filterNights],
          ["tournament", t.games.filterTournaments],
          ["friendly", t.games.filterFriendlies],
        ].map(([k, l]) => (
          <Link key={k} href={link({ kind: k })} className={`btn btn-sm ${kind === k ? "btn-primary" : ""}`}>
            {l}
          </Link>
        ))}
        {/* One month only: the filter would repeat "All", so it stays away until there is a second month. */}
        {(months.length > 1 || month) && (
          <>
            <span className="mx-1 text-line">|</span>
            <Link href={link({ month: "" })} className={`btn btn-sm ${!month ? "btn-primary" : ""}`}>
              {t.games.anyMonth}
            </Link>
            {months.slice(0, MONTH_CHIPS).map((m) => (
              <Link key={m} href={link({ month: m })} className={`btn btn-sm ${month === m ? "btn-primary" : ""}`}>
                {monthLabel(m)}
              </Link>
            ))}
            {months.length > MONTH_CHIPS && (
              <MonthSelect
                options={months.slice(MONTH_CHIPS).map((m) => ({ value: m, label: monthLabel(m), href: link({ month: m }) }))}
                value={month}
                label={t.games.earlierMonths}
                placeholder={t.games.earlierMonths}
              />
            )}
          </>
        )}
      </div>

      <Section title={t.games.results} flush right={pages > 1 ? <Pager page={page} pages={pages} link={link} labels={{ prev: t.games.prevPage, next: t.games.nextPage }} /> : undefined}>
        {games.length === 0 ? (
          <Empty icon="list" title={t.games.noGames}>{t.games.noMatch}</Empty>
        ) : (
          <>
            {/* Phone: one card per game, no horizontal scrolling. */}
            <ul className="sm:hidden divide-y divide-line/60">
              {games.map((g) => {
                const r = row(g);
                return (
                  <li key={g.id} className="px-4 py-3 flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-2 text-xs text-muted">
                      <span className="whitespace-nowrap">{g.completedAt && formatDateTime(g.completedAt, lang)}</span>
                      <span className="truncate">{r.event}</span>
                    </div>
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm">
                      <span className={`flex items-center justify-end gap-1.5 min-w-0 text-right ${r.ww ? "font-semibold" : r.bw ? "text-muted" : ""}`}>
                        <RatingDelta before={g.whiteRatingBefore} after={g.whiteRatingAfter} />
                        <PlayerLink id={g.whiteId} name={r.wn} className="truncate" />
                      </span>
                      {r.fix ? (
                        <ResultButtons gameId={g.id} current={g.result} names={{ white: r.wn, black: r.bn }} allowClear={false} />
                      ) : (
                        <span className="font-mono text-xs px-2 py-0.5 rounded bg-panel-2 border border-line">{resultLabel(g.result)}</span>
                      )}
                      <span className={`flex items-center gap-1.5 min-w-0 ${r.bw ? "font-semibold" : r.ww ? "text-muted" : ""}`}>
                        <PlayerLink id={g.blackId} name={r.bn} className="truncate" />
                        <RatingDelta before={g.blackRatingBefore} after={g.blackRatingAfter} />
                      </span>
                    </div>
                    {admin && !r.tr && (
                      <div className="flex justify-end">
                        <ConfirmButton action={deleteGame.bind(null, g.id)} className="btn btn-sm btn-danger" confirmLabel={t.common.delete}>
                          {t.common.delete}
                        </ConfirmButton>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>

            {/* Tablet and up: the table. */}
            <div className="hidden sm:block scroll-x">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t.games.date}</th>
                    <th className="text-right">⚪ {t.common.white}</th>
                    <th className="text-center">{t.common.result}</th>
                    <th>⚫ {t.common.black}</th>
                    <th>{t.games.event}</th>
                    {admin && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {games.map((g) => {
                    const r = row(g);
                    return (
                      <tr key={g.id} className="hover:bg-panel-2/50">
                        <td className="text-muted text-xs whitespace-nowrap">{g.completedAt && formatDateTime(g.completedAt, lang)}</td>
                        <td className={`text-right nowrap ${r.ww ? "font-semibold" : r.bw ? "text-muted" : ""}`}>
                          <RatingDelta before={g.whiteRatingBefore} after={g.whiteRatingAfter} className="mr-2" />
                          <PlayerLink id={g.whiteId} name={r.wn} />
                          <span className="text-xs text-muted font-mono ml-1.5">{g.whiteRatingBefore}</span>
                        </td>
                        <td className="text-center nowrap">
                          {r.fix ? (
                            <ResultButtons gameId={g.id} current={g.result} names={{ white: r.wn, black: r.bn }} allowClear={false} />
                          ) : (
                            <span className="font-mono text-xs px-2 py-0.5 rounded bg-panel-2 border border-line">{resultLabel(g.result)}</span>
                          )}
                        </td>
                        <td className={`nowrap ${r.bw ? "font-semibold" : r.ww ? "text-muted" : ""}`}>
                          <span className="text-xs text-muted font-mono mr-1.5">{g.blackRatingBefore}</span>
                          <PlayerLink id={g.blackId} name={r.bn} />
                          <RatingDelta before={g.blackRatingBefore} after={g.blackRatingAfter} className="ml-2" />
                        </td>
                        <td className="text-xs text-muted">{r.event}</td>
                        {admin && (
                          <td className="text-right">
                            {!r.tr && (
                              <ConfirmButton action={deleteGame.bind(null, g.id)} className="btn btn-sm btn-danger" confirmLabel={t.common.delete}>
                                {t.common.delete}
                              </ConfirmButton>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
        {pages > 1 && (
          <div className="px-5 py-3 border-t border-line flex justify-end">
            <Pager page={page} pages={pages} link={link} labels={{ prev: t.games.prevPage, next: t.games.nextPage }} />
          </div>
        )}
      </Section>
    </>
  );
}

function Pager({ page, pages, link, labels }: { page: number; pages: number; link: (o: Record<string, string | number | undefined>) => string; labels: { prev: string; next: string } }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs">
      <Link href={link({ page: Math.max(1, page - 1) })} className={`btn btn-sm ${page === 1 ? "pointer-events-none opacity-40" : ""}`} aria-label={labels.prev}>
        ←
      </Link>
      <span className="text-muted px-2 font-mono">
        {page} / {pages}
      </span>
      <Link href={link({ page: Math.min(pages, page + 1) })} className={`btn btn-sm ${page === pages ? "pointer-events-none opacity-40" : ""}`} aria-label={labels.next}>
        →
      </Link>
    </span>
  );
}
