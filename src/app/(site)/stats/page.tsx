import Link from "next/link";
import { readDb } from "@/lib/db";
import { clubStats, formatDate, formatMonth, leaderboard, monthTable, monthsWithGames, playerMap, ratingHistory, resultLabel } from "@/lib/queries";
import { RatingChart, seriesColor } from "@/components/RatingChart";
import { Empty, PageHeader, PlayerLink, Rank, Section } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function StatsPage({ searchParams }: PageProps<"/stats">) {
  const sp = await searchParams;
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
      <PageHeader eyebrow="Numbers" title="Club statistics" subtitle={<span>{st.games} rated games across {db.players.length} players</span>} />

      {st.games === 0 ? (
        <div className="card">
          <Empty icon="♚" title="Nothing to count yet">Statistics appear once games have been played.</Empty>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <div className="stat">
              <span className="stat-label">White · Draw · Black</span>
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
              <span className="stat-label">Average Elo</span>
              <span className="stat-value">{st.avgRating ?? "–"}</span>
              <span className="text-xs text-muted">active players</span>
            </div>
            <div className="stat">
              <span className="stat-label">Most active</span>
              {st.mostActive ? (
                <>
                  <span className="font-medium truncate">
                    <PlayerLink id={st.mostActive.playerId} name={names.get(st.mostActive.playerId)?.name ?? "?"} avatar />
                  </span>
                  <span className="text-xs text-muted">{st.mostActive.games} games</span>
                </>
              ) : (
                <span className="stat-value text-muted">–</span>
              )}
            </div>
            <div className="stat">
              <span className="stat-label">Longest win streak</span>
              {st.longestWinStreak ? (
                <>
                  <span className="font-medium truncate">
                    <PlayerLink id={st.longestWinStreak.playerId} name={names.get(st.longestWinStreak.playerId)?.name ?? "?"} avatar />
                  </span>
                  <span className="text-xs text-muted">🔥 {st.longestWinStreak.length} in a row</span>
                </>
              ) : (
                <span className="stat-value text-muted">–</span>
              )}
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
            <div className="col-stack">
              <Section title="Rating race" right={<span className="text-xs text-muted">top {series.length} players</span>}>
                <RatingChart series={series} names={names} height={260} />
              </Section>

              <Section
                title={month ? formatMonth(month) : "Monthly table"}
                flush
                right={
                  months.length > 1 ? (
                    <div className="flex gap-1 flex-wrap justify-end no-print">
                      {months.slice(0, 8).map((m) => (
                        <Link key={m} href={`/stats?month=${m}`} className={`btn btn-sm ${m === month ? "btn-primary" : "btn-ghost"}`}>
                          {formatMonth(m).slice(0, 3)} {m.slice(2, 4)}
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
                      <th>Player</th>
                      <th className="text-right">Pts</th>
                      <th className="text-right">Games</th>
                      <th className="text-right hidden sm:table-cell">W / D / L</th>
                      <th className="text-right">Elo Δ</th>
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
                <p className="px-5 py-3 text-xs text-muted border-t border-line">Month champion = most points; ties broken by rating gained.</p>
              </Section>
            </div>

            <div className="col-stack">
              <Section title="Activity">
                <div className="flex items-end gap-1 h-28">
                  {st.gamesPerMonth.slice(-12).map((m) => (
                    <div key={m.month} className="flex-1 flex flex-col items-center gap-1 group" title={`${formatMonth(m.month)}: ${m.games} games`}>
                      <span className="text-[10px] text-muted opacity-0 group-hover:opacity-100 font-mono">{m.games}</span>
                      <div className="w-full rounded-t bg-accent/70 group-hover:bg-accent transition-colors" style={{ height: `${Math.max(4, (m.games / maxMonth) * 80)}px` }} />
                      <span className="text-[10px] text-muted">{m.month.slice(5)}</span>
                    </div>
                  ))}
                </div>
              </Section>

              <Section title="Records">
                <dl className="flex flex-col gap-3 text-sm">
                  {st.biggestUpset && (
                    <div>
                      <dt className="text-xs uppercase tracking-wider text-muted">Biggest upset</dt>
                      <dd className="mt-0.5">
                        <PlayerLink id={st.biggestUpset.game.whiteId} name={names.get(st.biggestUpset.game.whiteId)?.name ?? "?"} />{" "}
                        <span className="font-mono text-xs px-1.5 rounded bg-panel-2 border border-line">{resultLabel(st.biggestUpset.game.result)}</span>{" "}
                        <PlayerLink id={st.biggestUpset.game.blackId} name={names.get(st.biggestUpset.game.blackId)?.name ?? "?"} />
                        <span className="text-xs text-muted ml-2">
                          {st.biggestUpset.diff} points lower · {st.biggestUpset.game.completedAt && formatDate(st.biggestUpset.game.completedAt)}
                        </span>
                      </dd>
                    </div>
                  )}
                  {st.highestRating && (
                    <div>
                      <dt className="text-xs uppercase tracking-wider text-muted">Highest rating ever</dt>
                      <dd className="mt-0.5">
                        <PlayerLink id={st.highestRating.playerId} name={names.get(st.highestRating.playerId)?.name ?? "?"} />{" "}
                        <span className="font-mono text-accent">{st.highestRating.rating}</span>
                        <span className="text-xs text-muted ml-2">{formatDate(st.highestRating.date)}</span>
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-xs uppercase tracking-wider text-muted">Decisive games</dt>
                    <dd className="mt-0.5">
                      {st.decisive} of {st.games} <span className="text-muted text-xs">({pct(st.decisive)}%)</span>
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
