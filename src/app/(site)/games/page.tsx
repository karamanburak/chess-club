import Link from "next/link";
import { Suspense } from "react";
import { readDb } from "@/lib/db";
import { isAdmin } from "@/lib/auth";
import { deleteGame } from "@/lib/actions";
import { completedGames, formatDateTime, formatMonth, monthsWithGames, playerMap, resultLabel } from "@/lib/queries";
import { ConfirmButton } from "@/components/ConfirmButton";
import { SearchBox } from "@/components/SearchBox";
import { Empty, PageHeader, PlayerLink, RatingDelta, Section } from "@/components/ui";

export const dynamic = "force-dynamic";
const PAGE = 50;

export default async function GamesPage({ searchParams }: PageProps<"/games">) {
  const sp = await searchParams;
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
  if (month) games = games.filter((g) => g.completedAt?.startsWith(month));
  const total = games.length;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  games = games.slice((page - 1) * PAGE, page * PAGE);

  const link = (over: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    const all = { q, kind, month, page: 1, ...over };
    for (const [k, v] of Object.entries(all)) if (v && String(v) !== "all" && !(k === "page" && v === 1)) p.set(k, String(v));
    const s = p.toString();
    return s ? `/games?${s}` : "/games";
  };

  return (
    <>
      <PageHeader
        eyebrow="History"
        title="Games"
        subtitle={<span>{total} games{q || kind !== "all" || month ? " match" : ""}, newest first</span>}
        actions={
          <Suspense>
            <SearchBox placeholder="Search player…" />
          </Suspense>
        }
      />
      <div className="flex flex-wrap items-center gap-2 mb-4 no-print">
        {[
          ["all", "All"],
          ["night", "Club nights"],
          ["tournament", "Tournaments"],
          ["friendly", "Friendlies"],
        ].map(([k, l]) => (
          <Link key={k} href={link({ kind: k })} className={`btn btn-sm ${kind === k ? "btn-primary" : ""}`}>
            {l}
          </Link>
        ))}
        <span className="mx-1 text-line">|</span>
        <Link href={link({ month: "" })} className={`btn btn-sm ${!month ? "btn-primary" : "btn-ghost"}`}>
          Any month
        </Link>
        {monthsWithGames(db)
          .slice(0, 6)
          .map((m) => (
            <Link key={m} href={link({ month: m })} className={`btn btn-sm ${month === m ? "btn-primary" : "btn-ghost"}`}>
              {formatMonth(m).slice(0, 3)} {m.slice(2, 4)}
            </Link>
          ))}
      </div>

      <Section title="Results" flush right={pages > 1 ? <Pager page={page} pages={pages} link={link} /> : undefined}>
        {games.length === 0 ? (
          <Empty icon="♝" title="No games">Nothing matches these filters.</Empty>
        ) : (
          <div className="scroll-x">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th className="text-right">⚪ White</th>
                  <th className="text-center">Result</th>
                  <th>⚫ Black</th>
                  <th className="hidden sm:table-cell">Event</th>
                  {admin && <th></th>}
                </tr>
              </thead>
              <tbody>
                {games.map((g) => {
                  const t = g.tournamentId ? tournaments.get(g.tournamentId) : null;
                  const ww = g.result === "1-0" || g.result === "+/-";
                  const bw = g.result === "0-1" || g.result === "-/+";
                  return (
                    <tr key={g.id} className="hover:bg-panel-2/50">
                      <td className="text-muted text-xs whitespace-nowrap">{g.completedAt && formatDateTime(g.completedAt)}</td>
                      <td className={`text-right nowrap ${ww ? "font-semibold" : bw ? "text-muted" : ""}`}>
                        <RatingDelta before={g.whiteRatingBefore} after={g.whiteRatingAfter} className="mr-2" />
                        <PlayerLink id={g.whiteId} name={names.get(g.whiteId)?.name ?? "?"} />
                        <span className="text-xs text-muted font-mono ml-1.5">{g.whiteRatingBefore}</span>
                      </td>
                      <td className="text-center">
                        <span className="font-mono text-xs px-2 py-0.5 rounded bg-panel-2 border border-line">{resultLabel(g.result)}</span>
                      </td>
                      <td className={`nowrap ${bw ? "font-semibold" : ww ? "text-muted" : ""}`}>
                        <span className="text-xs text-muted font-mono mr-1.5">{g.blackRatingBefore}</span>
                        <PlayerLink id={g.blackId} name={names.get(g.blackId)?.name ?? "?"} />
                        <RatingDelta before={g.blackRatingBefore} after={g.blackRatingAfter} className="ml-2" />
                      </td>
                      <td className="text-xs text-muted hidden sm:table-cell">
                        {t ? (
                          <Link href={`/tournaments/${t.id}`} className="hover:text-accent">
                            {t.name} · R{g.round}
                          </Link>
                        ) : g.sessionId ? (
                          <Link href={`/pairing/${g.sessionId}`} className="hover:text-accent">
                            Club night
                          </Link>
                        ) : (
                          "friendly"
                        )}
                        {!g.rated && <span className="ml-1 badge border-muted/40">unrated</span>}
                      </td>
                      {admin && (
                        <td className="text-right">
                          {!t && (
                            <ConfirmButton action={deleteGame.bind(null, g.id)} className="btn btn-sm btn-danger" confirmLabel="Delete">
                              Delete
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
        )}
        {pages > 1 && (
          <div className="px-5 py-3 border-t border-line flex justify-end">
            <Pager page={page} pages={pages} link={link} />
          </div>
        )}
      </Section>
    </>
  );
}

function Pager({ page, pages, link }: { page: number; pages: number; link: (o: Record<string, string | number | undefined>) => string }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs">
      <Link href={link({ page: Math.max(1, page - 1) })} className={`btn btn-sm ${page === 1 ? "pointer-events-none opacity-40" : ""}`}>
        ←
      </Link>
      <span className="text-muted px-2 font-mono">
        {page} / {pages}
      </span>
      <Link href={link({ page: Math.min(pages, page + 1) })} className={`btn btn-sm ${page === pages ? "pointer-events-none opacity-40" : ""}`}>
        →
      </Link>
    </span>
  );
}
