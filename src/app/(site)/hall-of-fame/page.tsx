import Link from "next/link";
import { readDb } from "@/lib/db";
import { isAdmin } from "@/lib/auth";
import { getT } from "@/lib/lang";
import { fmt, plural } from "@/lib/i18n";
import { achievements, currentSeason, monthChampions, seasonTable, titleFor, TITLES, tournamentWinners } from "@/lib/club";
import { clubStats, formatDate, formatMonth, leaderboard, playerMap, resultLabel } from "@/lib/queries";
import { Avatar, Empty, PageHeader, PlayerLink, Rank, Section, TitleBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function HallOfFamePage() {
  const { t, lang } = await getT();
  const db = await readDb();
  const admin = await isAdmin();
  const club = db.settings.club;
  const names = playerMap(db);
  const name = (id: string | null) => (id ? (names.get(id)?.name ?? "?") : "–");
  const season = currentSeason(db);
  const table = season ? seasonTable(db, season).slice(0, 8) : [];
  const past = db.seasons.filter((s) => s.end).sort((a, b) => b.start.localeCompare(a.start));
  const winners = tournamentWinners(db);
  const months = monthChampions(db).slice(0, 12);
  const st = clubStats(db);
  const decorated = db.players
    .map((p) => ({ p, earned: achievements(db, p.id).filter((a) => a.earnedAt) }))
    .filter((x) => x.earned.length)
    .sort((a, b) => b.earned.length - a.earned.length || b.p.rating - a.p.rating)
    .slice(0, 6);
  const holders = [...TITLES]
    .reverse()
    .map((title) => ({ title, players: leaderboard(db).filter((p) => titleFor(p)?.key === title.key) }))
    .filter((x) => x.players.length);

  return (
    <>
      <PageHeader
        eyebrow={club.name}
        title={t.hall.title}
        subtitle={<span>{t.hall.subtitle}</span>}
        actions={admin ? <Link href="/admin#seasons" className="btn">{t.hall.manageSeasons}</Link> : undefined}
      />

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="col-stack">
          <Section
            title={season ? fmt(t.hall.seasonRunning, { season: season.name }) : t.hall.noSeasonRunning}
            flush
            right={season ? <span className="text-xs text-muted">{fmt(t.hall.since, { date: formatDate(season.start, lang) })}</span> : undefined}
          >
            {!season ? (
              <Empty icon="flag" title={t.hall.betweenSeasons}>{admin ? <Link href="/admin#seasons" className="text-accent hover:underline">{t.hall.startNextSeason}</Link> : t.hall.adminCanStart}</Empty>
            ) : table.length === 0 ? (
              <Empty icon="pawn" title={t.hall.noGamesThisSeason}>{t.hall.seasonTableFills}</Empty>
            ) : (
              <div className="scroll-x">
                <table className="table">
                  <thead>
                    <tr>
                      <th className="w-12 text-center">#</th>
                      <th>{t.common.player}</th>
                      <th className="text-right">{t.common.points}</th>
                      <th className="text-right hidden sm:table-cell">{t.common.games}</th>
                      <th className="text-right hidden lg:table-cell">{t.common.wdl}</th>
                      <th className="text-right hidden sm:table-cell">{t.hall.eloPlusMinus}</th>
                      <th className="text-right hidden xl:table-cell">{t.hall.nights}</th>
                      <th className="text-right hidden xl:table-cell">{t.hall.titles}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {table.map((r, i) => (
                      <tr key={r.playerId} className={i === 0 ? "bg-accent/5" : ""}>
                        <td className="text-center">
                          <Rank n={i + 1} />
                        </td>
                        <td className="font-medium">
                          <PlayerLink id={r.playerId} name={name(r.playerId)} avatar />
                        </td>
                        <td className="text-right font-mono text-accent">{r.points}</td>
                        <td className="text-right font-mono text-muted hidden sm:table-cell">{r.games}</td>
                        <td className="text-right font-mono text-xs hidden lg:table-cell nowrap">
                          <span className="text-win">{r.wins}</span> / <span className="text-draw">{r.draws}</span> / <span className="text-loss">{r.losses}</span>
                        </td>
                        <td className={`text-right font-mono text-xs hidden sm:table-cell ${r.ratingChange > 0 ? "text-win" : r.ratingChange < 0 ? "text-loss" : "text-muted"}`}>
                          {r.ratingChange > 0 ? "+" : ""}
                          {r.ratingChange}
                        </td>
                        <td className="text-right font-mono text-muted hidden xl:table-cell">{r.nights}</td>
                        <td className="text-right hidden xl:table-cell">{r.titles ? "🏆".repeat(r.titles) : <span className="text-muted">–</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section title={t.hall.seasonChampions} flush>
            {past.length === 0 ? (
              <Empty icon="crown" title={t.hall.noSeasonClosed}>{t.hall.firstChampion}</Empty>
            ) : (
              <ul className="divide-y divide-line">
                {past.map((s) => (
                  <li key={s.id} className="flex items-center gap-4 px-4 py-3">
                    <span className="text-2xl" aria-hidden>
                      👑
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block font-medium">{s.name}</span>
                      <span className="block text-xs text-muted">
                        {formatDate(s.start, lang)} – {s.end ? formatDate(s.end, lang) : ""}
                      </span>
                    </span>
                    {s.championId ? (
                      <span className="flex items-center gap-2">
                        <Avatar id={s.championId} name={name(s.championId)} size="md" />
                        <PlayerLink id={s.championId} name={name(s.championId)} className="font-semibold" />
                      </span>
                    ) : (
                      <span className="text-sm text-muted">{t.hall.noGames}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title={t.hall.tournamentWinners} flush>
            {winners.length === 0 ? (
              <Empty icon="trophy" title={t.hall.noFinishedTournament} />
            ) : (
              <ul className="divide-y divide-line">
                {winners.map((w) => (
                  <li key={w.tournament.id} className="flex items-center gap-4 px-4 py-3">
                    <span className="text-2xl" aria-hidden>
                      🏆
                    </span>
                    <span className="flex-1 min-w-0">
                      <Link href={`/tournaments/${w.tournament.id}`} className="block font-medium hover:text-accent truncate">
                        {w.tournament.name}
                      </Link>
                      <span className="block text-xs text-muted">
                        {formatDate(w.tournament.date, lang)} · {t.hall.modes[w.tournament.pairingMode as keyof typeof t.hall.modes] ?? w.tournament.pairingMode} · {plural(w.tournament.participantIds.length, t.common.playersN)}
                        {w.runnerUpId ? ` · ${fmt(t.hall.runnerUp, { name: name(w.runnerUpId) })}` : ""}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <Avatar id={w.playerId} name={name(w.playerId)} size="md" />
                      <PlayerLink id={w.playerId} name={name(w.playerId)} className="font-semibold" />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        <div className="col-stack">
          <Section title={t.hall.titleHolders}>
            {holders.length === 0 ? (
              <p className="text-sm text-muted">{t.hall.titlesHint}</p>
            ) : (
              <div className="flex flex-col gap-3">
                {holders.map(({ title, players }) => (
                  <div key={title.key}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <TitleBadge title={title} />
                      <span className="text-xs text-muted">{players.length}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {players.map((p) => (
                        <PlayerLink key={p.id} id={p.id} name={p.name} avatar rating={p.rating} className="text-sm border border-line rounded-full pl-1 pr-3 py-0.5 bg-panel-2/40" />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section title={t.hall.mostDecorated}>
            {decorated.length === 0 ? (
              <p className="text-sm text-muted">{t.hall.achievementsHint}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {decorated.map(({ p, earned }) => (
                  <li key={p.id} className="flex items-center gap-3">
                    <PlayerLink id={p.id} name={p.name} avatar className="flex-1 font-medium" />
                    <span className="text-base tracking-wide" title={earned.map((a) => t.club.achievements[a.key as keyof typeof t.club.achievements]?.label ?? a.label).join(", ")}>
                      {earned.slice(0, 6).map((a) => a.icon).join(" ")}
                      {earned.length > 6 && <span className="text-xs text-muted ml-1">+{earned.length - 6}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title={t.hall.playerOfTheMonth} flush>
            {months.length === 0 ? (
              <Empty icon="pin" title={t.hall.notEnoughGames}>{t.hall.threeGamesNeeded}</Empty>
            ) : (
              <ul className="divide-y divide-line">
                {months.map((m) => (
                  <li key={m.month} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <span className="w-24 text-muted text-xs">{formatMonth(m.month, lang)}</span>
                    <PlayerLink id={m.playerId} name={name(m.playerId)} avatar className="flex-1 font-medium" />
                    <span className="font-mono text-xs text-muted">
                      {m.points}/{m.games}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title={t.hall.clubRecords}>
            <ul className="flex flex-col gap-2.5 text-sm">
              <li className="flex items-center justify-between gap-3">
                <span className="text-muted">{t.hall.highestRating}</span>
                {st.highestRating ? (
                  <span className="flex items-center gap-2">
                    <PlayerLink id={st.highestRating.playerId} name={name(st.highestRating.playerId)} />
                    <span className="font-mono text-accent">{st.highestRating.rating}</span>
                  </span>
                ) : (
                  <span className="text-muted">–</span>
                )}
              </li>
              <li className="flex items-center justify-between gap-3">
                <span className="text-muted">{t.hall.longestWinStreak}</span>
                {st.longestWinStreak ? (
                  <span className="flex items-center gap-2">
                    <PlayerLink id={st.longestWinStreak.playerId} name={name(st.longestWinStreak.playerId)} />
                    <span className="font-mono">🔥 {st.longestWinStreak.length}</span>
                  </span>
                ) : (
                  <span className="text-muted">–</span>
                )}
              </li>
              <li className="flex items-center justify-between gap-3">
                <span className="text-muted">{t.hall.biggestUpset}</span>
                {st.biggestUpset ? (
                  <span className="text-right">
                    <span className="block">
                      {name(st.biggestUpset.game.whiteId)} {resultLabel(st.biggestUpset.game.result)} {name(st.biggestUpset.game.blackId)}
                    </span>
                    <span className="block text-xs text-muted">{fmt(t.hall.pointsApart, { n: st.biggestUpset.diff })}</span>
                  </span>
                ) : (
                  <span className="text-muted">–</span>
                )}
              </li>
              <li className="flex items-center justify-between gap-3">
                <span className="text-muted">{t.hall.mostGames}</span>
                {st.mostActive ? (
                  <span className="flex items-center gap-2">
                    <PlayerLink id={st.mostActive.playerId} name={name(st.mostActive.playerId)} />
                    <span className="font-mono">{st.mostActive.games}</span>
                  </span>
                ) : (
                  <span className="text-muted">–</span>
                )}
              </li>
            </ul>
          </Section>
        </div>
      </div>
    </>
  );
}
