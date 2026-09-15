import Link from "next/link";
import { readDb } from "@/lib/db";
import { getT } from "@/lib/lang";
import { fmt, plural } from "@/lib/i18n";
import { clubStats, formatDate, formatMonth, leaderboard, monthTable, monthsWithGames, playerMap, ratingHistory, resultLabel } from "@/lib/queries";
import { RatingChart, seriesColor } from "@/components/RatingChart";
import { Empty, PageHeader, PlayerLink, Rank, Section } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function StatsPage({ searchParams }: PageProps<"/stats">) {
  const sp = await searchParams;
  const { t, lang } = await getT();
  const db = await readDb();
  const names = playerMap(db);
  const st = clubStats(db);
  const months = monthsWithGames(db);
  const month = typeof sp.month === "string" && months.includes(sp.month) ? sp.month : months[0];
  const rows = month ? monthTable(db, month) : [];
  const top = leaderboard(db).slice(0, 6);
  const series = top.map((p, i) => ({ name: p.name, color: seriesColor(i), points: ratingHistory(db, p) })).filter((s) => s.points.length > 1);
  const maxMonth = Math.max(1, ...st.gamesPerMonth.map((m) => m.games));
  const pct = (n: number) => (st.games ? Math.round((n / st.games) * 100) : 0);

  return (
    <>
      <PageHeader eyebrow={t.stats.eyebrow} title={t.stats.title} subtitle={<span>{fmt(t.stats.subtitle, { games: st.games, players: db.players.length })}</span>} />

      {st.games === 0 ? (
        <div className="card">
          <Empty icon="crown" title={t.stats.emptyTitle}>{t.stats.emptyText}</Empty>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <div className="stat">
              <span className="stat-label">{t.stats.whiteDrawBlack}</span>
              <span className="stat-value text-lg">
                <span className="text-fg">{pct(st.whiteWins)}%</span> <span className="text-muted">·</span> <span className="text-draw">{pct(st.draws)}%</span>{" "}
                <span className="text-muted">·</span> <span className="text-fg">{pct(st.blackWins)}%</span>
              </span>
              <span className="flex h-1.5 rounded-full overflow-hidden mt-1">
                <span className="bg-white" style={{ width: `${pct(st.whiteWins)}%` }} />
                <span className="bg-draw" style={{ width: `${pct(st.draws)}%` }} />
                <span className="bg-black border border-muted/40" style={{ width: `${pct(st.blackWins)}%` }} />
              </span>
            </div>
            <div className="stat">
              <span className="stat-label">{t.stats.averageElo}</span>
              <span className="stat-value">{st.avgRating ?? "–"}</span>
              <span className="text-xs text-muted">{t.stats.activePlayers}</span>
            </div>
            <div className="stat">
              <span className="stat-label">{t.stats.mostActive}</span>
              {st.mostActive ? (
                <>
                  <span className="font-medium truncate">
                    <PlayerLink id={st.mostActive.playerId} name={names.get(st.mostActive.playerId)?.name ?? "?"} avatar />
                  </span>
                  <span className="text-xs text-muted">{plural(st.mostActive.games, t.common.gamesN)}</span>
                </>
              ) : (
                <span className="stat-value text-muted">–</span>
              )}
            </div>
            <div className="stat">
              <span className="stat-label">{t.stats.longestWinStreak}</span>
              {st.longestWinStreak ? (
                <>
                  <span className="font-medium truncate">
                    <PlayerLink id={st.longestWinStreak.playerId} name={names.get(st.longestWinStreak.playerId)?.name ?? "?"} avatar />
                  </span>
                  <span className="text-xs text-muted">🔥 {fmt(t.stats.inARow, { n: st.longestWinStreak.length })}</span>
                </>
              ) : (
                <span className="stat-value text-muted">–</span>
              )}
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
            <div className="col-stack">
              <Section title={t.stats.ratingRace} right={<span className="text-xs text-muted">{fmt(t.stats.topPlayers, { n: series.length })}</span>}>
                <RatingChart series={series} names={names} height={260} />
              </Section>

              <Section
                title={month ? formatMonth(month, lang) : t.stats.monthlyTable}
                flush
                right={
                  months.length > 1 ? (
                    <div className="flex gap-1 flex-wrap justify-end no-print">
                      {months.slice(0, 8).map((m) => (
                        <Link key={m} href={`/stats?month=${m}`} className={`btn btn-sm ${m === month ? "btn-primary" : "btn-ghost"}`}>
                          {formatMonth(m, lang).slice(0, 3)} {m.slice(2, 4)}
                        </Link>
                      ))}
                    </div>
                  ) : undefined
                }
              >
                <table className="table">
                  <thead>
                    <tr>
                      <th className="w-10 text-center">#</th>
                      <th>{t.common.player}</th>
                      <th className="text-right">{t.common.points}</th>
                      <th className="text-right">{t.common.games}</th>
                      <th className="text-right hidden sm:table-cell">{t.common.wdl}</th>
                      <th className="text-right">{t.stats.eloDelta}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={r.playerId} className={i === 0 ? "bg-accent/[0.04]" : ""}>
                        <td className="text-center">
                          <Rank n={i + 1} />
                        </td>
                        <td>
                          <PlayerLink id={r.playerId} name={names.get(r.playerId)?.name ?? "?"} avatar className="font-medium" />
                        </td>
                        <td className="text-right font-mono text-accent">{r.points}</td>
                        <td className="text-right font-mono">{r.games}</td>
                        <td className="text-right font-mono text-xs hidden sm:table-cell nowrap">
                          <span className="text-win">{r.wins}</span> / <span className="text-draw">{r.draws}</span> / <span className="text-loss">{r.losses}</span>
                        </td>
                        <td className={`text-right font-mono ${r.ratingChange > 0 ? "text-win" : r.ratingChange < 0 ? "text-loss" : "text-muted"}`}>
                          {r.ratingChange > 0 ? "+" : ""}
                          {r.ratingChange}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="px-5 py-3 text-xs text-muted border-t border-line">{t.stats.monthChampionNote}</p>
              </Section>
            </div>

            <div className="col-stack">
              <Section title={t.stats.activity}>
                <div className="flex items-end gap-1 h-28">
                  {st.gamesPerMonth.slice(-12).map((m) => (
                    <div key={m.month} className="flex-1 flex flex-col items-center gap-1 group" title={`${formatMonth(m.month, lang)}: ${plural(m.games, t.common.gamesN)}`}>
                      <span className="text-[10px] text-muted opacity-0 group-hover:opacity-100 font-mono">{m.games}</span>
                      <div className="w-full rounded-t bg-accent/70 group-hover:bg-accent transition-colors" style={{ height: `${Math.max(4, (m.games / maxMonth) * 80)}px` }} />
                      <span className="text-[10px] text-muted">{m.month.slice(5)}</span>
                    </div>
                  ))}
                </div>
              </Section>

              <Section title={t.stats.records}>
                <dl className="flex flex-col gap-3 text-sm">
                  {st.biggestUpset && (
                    <div>
                      <dt className="text-xs uppercase tracking-wider text-muted">{t.stats.biggestUpset}</dt>
                      <dd className="mt-0.5">
                        <PlayerLink id={st.biggestUpset.game.whiteId} name={names.get(st.biggestUpset.game.whiteId)?.name ?? "?"} />{" "}
                        <span className="font-mono text-xs px-1.5 rounded bg-panel-2 border border-line">{resultLabel(st.biggestUpset.game.result)}</span>{" "}
                        <PlayerLink id={st.biggestUpset.game.blackId} name={names.get(st.biggestUpset.game.blackId)?.name ?? "?"} />
                        <span className="text-xs text-muted ml-2">
                          {fmt(t.stats.pointsLower, { n: st.biggestUpset.diff })} · {st.biggestUpset.game.completedAt && formatDate(st.biggestUpset.game.completedAt, lang)}
                        </span>
                      </dd>
                    </div>
                  )}
                  {st.highestRating && (
                    <div>
                      <dt className="text-xs uppercase tracking-wider text-muted">{t.stats.highestRating}</dt>
                      <dd className="mt-0.5">
                        <PlayerLink id={st.highestRating.playerId} name={names.get(st.highestRating.playerId)?.name ?? "?"} />{" "}
                        <span className="font-mono text-accent">{st.highestRating.rating}</span>
                        <span className="text-xs text-muted ml-2">{formatDate(st.highestRating.date, lang)}</span>
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-xs uppercase tracking-wider text-muted">{t.stats.decisiveGames}</dt>
                    <dd className="mt-0.5">
                      {fmt(t.stats.nOfTotal, { n: st.decisive, total: st.games })} <span className="text-muted text-xs">({pct(st.decisive)}%)</span>
                    </dd>
                  </div>
                </dl>
              </Section>
            </div>
          </div>
        </>
      )}
    </>
  );
}
