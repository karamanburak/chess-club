import Link from "next/link";
import { readDb } from "@/lib/db";
import { isAdmin } from "@/lib/auth";
import { achievements, currentSeason, monthChampions, seasonTable, titleFor, TITLES, tournamentWinners } from "@/lib/club";
import { clubStats, formatDate, formatMonth, leaderboard, playerMap, resultLabel } from "@/lib/queries";
import { Avatar, Empty, PageHeader, PlayerLink, Rank, Section, TitleBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

const MODE_LABEL: Record<string, string> = { random: "Random", swiss: "Swiss", roundrobin: "Round robin", knockout: "Knockout" };

export default async function HallOfFamePage() {
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
    .map((t) => ({ t, players: leaderboard(db).filter((p) => titleFor(p)?.key === t.key) }))
    .filter((x) => x.players.length);

  return (
    <>
      <PageHeader
        eyebrow={club.founded ? `${club.name} · est. ${club.founded}` : club.name}
        title="Hall of Fame"
        subtitle={<span>Champions, titles and records. Everything here is earned over the board.</span>}
        actions={admin ? <Link href="/admin#seasons" className="btn">Manage seasons</Link> : undefined}
      />

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="col-stack">
          <Section
            title={season ? `${season.name} · running` : "No season running"}
            flush
            right={season ? <span className="text-xs text-muted">since {formatDate(season.start)}</span> : undefined}
          >
            {!season ? (
              <Empty icon="🏁" title="Between seasons">{admin ? <Link href="/admin#seasons" className="text-accent hover:underline">Start the next season</Link> : "The admin can start the next season."}</Empty>
            ) : table.length === 0 ? (
              <Empty icon="♟" title="No games this season yet">The season table fills up as games are played.</Empty>
            ) : (
              <div className="scroll-x">
                <table className="table">
                  <thead>
                    <tr>
                      <th className="w-12 text-center">#</th>
                      <th>Player</th>
                      <th className="text-right">Pts</th>
                      <th className="text-right hidden sm:table-cell">Games</th>
                      <th className="text-right hidden md:table-cell">W / D / L</th>
                      <th className="text-right hidden sm:table-cell">Elo ±</th>
                      <th className="text-right hidden md:table-cell">Nights</th>
                      <th className="text-right hidden md:table-cell">Titles</th>
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
                        <td className="text-right font-mono text-xs hidden md:table-cell nowrap">
                          <span className="text-win">{r.wins}</span> / <span className="text-draw">{r.draws}</span> / <span className="text-loss">{r.losses}</span>
                        </td>
                        <td className={`text-right font-mono text-xs hidden sm:table-cell ${r.ratingChange > 0 ? "text-win" : r.ratingChange < 0 ? "text-loss" : "text-muted"}`}>
                          {r.ratingChange > 0 ? "+" : ""}
                          {r.ratingChange}
                        </td>
                        <td className="text-right font-mono text-muted hidden md:table-cell">{r.nights}</td>
                        <td className="text-right hidden md:table-cell">{r.titles ? "🏆".repeat(r.titles) : <span className="text-muted">–</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section title="Season champions" flush>
            {past.length === 0 ? (
              <Empty icon="👑" title="No season closed yet">The first champion is crowned when the admin closes a season.</Empty>
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
                        {formatDate(s.start)} – {s.end ? formatDate(s.end) : ""}
                      </span>
                    </span>
                    {s.championId ? (
                      <span className="flex items-center gap-2">
                        <Avatar id={s.championId} name={name(s.championId)} size="md" />
                        <PlayerLink id={s.championId} name={name(s.championId)} className="font-semibold" />
                      </span>
                    ) : (
                      <span className="text-sm text-muted">no games</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Tournament winners" flush>
            {winners.length === 0 ? (
              <Empty icon="🏆" title="No finished tournament yet" />
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
                        {formatDate(w.tournament.date)} · {MODE_LABEL[w.tournament.pairingMode]} · {w.tournament.participantIds.length} players
                        {w.runnerUpId ? ` · runner-up ${name(w.runnerUpId)}` : ""}
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
          <Section title="Title holders">
            {holders.length === 0 ? (
              <p className="text-sm text-muted">Titles are held from 10 games on and follow the rating: Club Player 1100, Expert 1300, Master 1500, Grandmaster 1700.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {holders.map(({ t, players }) => (
                  <div key={t.key}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <TitleBadge title={t} />
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

          <Section title="Most decorated">
            {decorated.length === 0 ? (
              <p className="text-sm text-muted">Achievements appear on player profiles as they are earned.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {decorated.map(({ p, earned }) => (
                  <li key={p.id} className="flex items-center gap-3">
                    <PlayerLink id={p.id} name={p.name} avatar className="flex-1 font-medium" />
                    <span className="text-base tracking-wide" title={earned.map((a) => a.label).join(", ")}>
                      {earned.slice(0, 6).map((a) => a.icon).join(" ")}
                      {earned.length > 6 && <span className="text-xs text-muted ml-1">+{earned.length - 6}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Player of the month" flush>
            {months.length === 0 ? (
              <Empty icon="📅" title="Not enough games yet">Three games in a month are needed.</Empty>
            ) : (
              <ul className="divide-y divide-line">
                {months.map((m) => (
                  <li key={m.month} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <span className="w-24 text-muted text-xs">{formatMonth(m.month)}</span>
                    <PlayerLink id={m.playerId} name={name(m.playerId)} avatar className="flex-1 font-medium" />
                    <span className="font-mono text-xs text-muted">
                      {m.points}/{m.games}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Club records">
            <ul className="flex flex-col gap-2.5 text-sm">
              <li className="flex items-center justify-between gap-3">
                <span className="text-muted">Highest rating ever</span>
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
                <span className="text-muted">Longest win streak</span>
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
                <span className="text-muted">Biggest upset</span>
                {st.biggestUpset ? (
                  <span className="text-right">
                    <span className="block">
                      {name(st.biggestUpset.game.whiteId)} {resultLabel(st.biggestUpset.game.result)} {name(st.biggestUpset.game.blackId)}
                    </span>
                    <span className="block text-xs text-muted">{st.biggestUpset.diff} rating points apart</span>
                  </span>
                ) : (
                  <span className="text-muted">–</span>
                )}
              </li>
              <li className="flex items-center justify-between gap-3">
                <span className="text-muted">Most games</span>
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
