import Link from "next/link";
import { readDb } from "@/lib/db";
import { currentPlayerId, isAdmin } from "@/lib/auth";
import { MyChallenges } from "@/components/MyChallenges";
import { getT } from "@/lib/lang";
import { fmt, plural } from "@/lib/i18n";
import { currentSeason, highlights, seasonOverdue, titleFor } from "@/lib/club";
import { activeSession, completedGames, completedGamesByPlayer, formatDateTime, leaderboard, playerMap, rankChanges, recentForm, ratingTrend, resultLabel, sessionRoundComplete, streaks } from "@/lib/queries";
import { Avatar, Empty, FormDots, Pager, PlayerLink, Provisional, Rank, RankMove, RatingDelta, Section, StatusBadge, StreakBadge, TitleBadge } from "@/components/ui";
import { nameOf } from "@/lib/score";
import { Icon, KnightMark } from "@/components/icons";
import { QuoteOfTheDay } from "@/components/QuoteOfTheDay";
import { DailyPuzzle } from "@/components/DailyPuzzle";
import { lichessPuzzleUrl, puzzleOfTheDay } from "@/lib/puzzles";
import { upcoming } from "@/lib/challenges";
import { daysFromToday, localDay } from "@/lib/time";

export const dynamic = "force-dynamic";

const PAGE = 12;

export default async function Home({ searchParams }: PageProps<"/">) {
  // Chosen on the server by the club's calendar day; the client only gets this one puzzle.
  const puzzle = puzzleOfTheDay();
  const sp = await searchParams;
  const { t, lang } = await getT();
  const db = await readDb();
  const board = leaderboard(db);
  const pages = Math.max(1, Math.ceil(board.length / PAGE));
  const page = Math.min(pages, Math.max(1, Number(sp.page) || 1));
  const offset = (page - 1) * PAGE;
  const shown = board.slice(offset, offset + PAGE);
  const names = playerMap(db);
  const played = completedGames(db);
  // A ranking row is about 1.4 times as tall as a game row: this many games end level with the table beside them.
  const recent = played.slice(0, Math.max(10, Math.round(shown.length * 1.4)));
  const open = db.tournaments.filter((t) => t.status !== "finished").sort((a, b) => b.date.localeCompare(a.date));
  const top = board[0];
  const night = activeSession(db);
  const nightRound = night?.rounds[night.rounds.length - 1];
  const nightPending = nightRound ? nightRound.pairings.filter((p) => !db.games.find((g) => g.id === p.gameId)?.result).length : 0;
  const moves = rankChanges(db);
  const byPlayer = completedGamesByPlayer(db);
  const pageHref = (n: number) => (n <= 1 ? "/" : `/?page=${n}`);
  const club = db.settings.club;
  const season = currentSeason(db);
  const next = daysFromToday(club.nextNight);
  const nextLabel = next === null || next < 0 ? null : next === 0 ? t.common.tonight : next === 1 ? t.common.tomorrow : fmt(t.common.inDays, { n: next });
  const hl = highlights(db, 14, t.club.highlights);
  const me = await currentPlayerId();
  const admin = await isAdmin();
  const showPuzzle = !!me || admin;
  const today = localDay();
  const mySolve = me ? db.puzzleSolves.find((x) => x.day === today && x.playerId === me) : undefined;
  const savedPuzzle = mySolve ? { result: mySolve.result, misses: mySolve.misses, hint: mySolve.hint } : null;
  const member = admin || !!me;
  const overdue = season && admin ? seasonOverdue(season) : null;
  // A claimed device sees its own numbers where a guest sees the club's: what a member opens the page for.
  const mine = me ? db.players.find((p) => p.id === me) : undefined;
  const myRank = mine ? board.findIndex((p) => p.id === mine.id) + 1 : 0;
  const myTrend = mine ? ratingTrend(db, mine.id) : null;
  const myNext = me ? upcoming(db, me)[0] : undefined;
  const bottomCards = 1 + (showPuzzle ? 1 : 0) + (hl.length > 0 ? 1 : 0);

  return (
    <>
      <section className="card board-texture mb-6 relative overflow-hidden p-5 md:p-6">
        <KnightMark mono className="pointer-events-none select-none absolute -right-6 -top-6 h-44 w-44 text-fg opacity-[0.04]" />
        <div className="relative flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
          <div className="min-w-0 flex-1 flex flex-col gap-3">
            <h1 className="sr-only">{club.name}</h1>
            <QuoteOfTheDay size="md" className="max-w-2xl" />
            {(club.meets || nextLabel) && (
              <p className="text-sm text-muted flex flex-wrap items-center gap-x-2">
                {nextLabel && (
                  <span className="text-accent inline-flex items-center gap-1.5">
                    <Icon name="pawn" className="h-3.5 w-3.5" /> {fmt(t.home.nextNight, { when: nextLabel })}
                  </span>
                )}
                {club.meets && nextLabel && <span aria-hidden>·</span>}
                {club.meets && <span>{club.meets}</span>}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2 shrink-0 sm:justify-end">
            <Link href="/pairing" className="btn btn-primary">
              <Icon name="pawn" className="h-4 w-4" /> {night ? t.home.backToNight : member ? t.home.startNight : t.common.clubNight}
            </Link>
            <Link href="/tournaments" className="btn">
              {member ? t.home.newTournament : t.home.tournaments}
            </Link>
            <Link href="/tv" target="_blank" className="btn btn-ghost" title={t.common.tvHint} aria-label={t.common.tv}>
              <Icon name="tv" className="h-4 w-4" />
            </Link>
          </div>
        </div>
        {overdue && (
          <Link href="/admin#seasons" className="relative mt-4 rounded-xl border border-accent/40 bg-accent/10 px-4 py-2.5 text-sm flex items-start gap-2 hover:border-accent/70 transition-colors">
            <Icon name="trophy" className="h-4 w-4 mt-0.5 shrink-0 text-accent" />
            <span>{fmt(t.home.seasonOverdue, { season: season!.name, months: overdue })}</span>
          </Link>
        )}
        {club.announcement && <div className="relative mt-4 rounded-xl border border-accent/30 bg-accent/10 px-4 py-2.5 text-sm flex items-start gap-2"><Icon name="pin" className="h-4 w-4 mt-0.5 shrink-0 text-accent" /> <span>{club.announcement}</span></div>}
      </section>

      {mine ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <Link href={`/players/${mine.id}`} className="stat hover:border-accent/50 transition-colors">
            <span className="stat-label">{t.home.yourElo}</span>
            <span className="stat-value flex items-baseline gap-2">
              <span className="font-mono">{mine.rating}</span>
              {myTrend !== null && myTrend !== 0 && (
                <span className={`font-mono text-sm ${myTrend > 0 ? "text-win" : "text-loss"}`} title={t.home.trendHint}>
                  {myTrend > 0 ? "+" : ""}
                  {myTrend}
                </span>
              )}
            </span>
          </Link>
          <div className="stat">
            <span className="stat-label">{t.home.yourRank}</span>
            <span className="stat-value flex items-baseline gap-2">
              {myRank > 0 ? `#${myRank}` : "–"}
              {myRank > 0 && <span className="text-sm text-muted">{fmt(t.home.rankOf, { n: board.length })}</span>}
              <RankMove delta={moves.get(mine.id)} />
            </span>
          </div>
          <div className="stat">
            <span className="stat-label">{t.home.yourForm}</span>
            <span className="flex items-center min-h-8">
              <FormDots results={recentForm(db, mine.id)} />
            </span>
          </div>
          <Link href="/challenges" className="stat hover:border-accent/50 transition-colors">
            <span className="stat-label">{t.home.yourNext}</span>
            {myNext ? (
              <span className="flex items-center gap-2 min-w-0">
                <Avatar id={myNext.fromId === me ? myNext.toId : myNext.fromId} name={nameOf(names, myNext.fromId === me ? myNext.toId : myNext.fromId)} size="sm" />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{nameOf(names, myNext.fromId === me ? myNext.toId : myNext.fromId)}</span>
                  <span className="block text-xs text-muted">{formatDateTime(myNext.at, lang)}</span>
                </span>
              </span>
            ) : (
              <span className="text-sm text-accent inline-flex items-center gap-1.5">
                <Icon name="swords" className="h-4 w-4" /> {t.home.challengeSomeone}
              </span>
            )}
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="stat">
            <span className="stat-label">{t.home.activePlayers}</span>
            <span className="stat-value">{board.length}</span>
          </div>
          <div className="stat">
            <span className="stat-label">{t.home.gamesPlayed}</span>
            <span className="stat-value">{played.length}</span>
          </div>
          <div className="stat">
            <span className="stat-label">{t.home.tournaments}</span>
            <span className="stat-value">
              {db.tournaments.length}
              {open.length > 0 && <span className="text-sm text-accent ml-2">{fmt(t.home.nLive, { n: open.length })}</span>}
            </span>
          </div>
          <div className="stat">
            <span className="stat-label">{t.home.topRated}</span>
            {top ? (
              <span className="flex items-center gap-2 min-w-0">
                <Avatar id={top.id} name={top.name} size="sm" />
                <span className="truncate font-medium">{top.name}</span>
                <span className="font-mono text-accent ml-auto">{top.rating}</span>
              </span>
            ) : (
              <span className="stat-value text-muted">–</span>
            )}
          </div>
        </div>
      )}

      {/* Personal first, full width: what waits on me. Then two lists of similar height side by side, then three small cards. */}
      <div className="mb-6 empty:hidden">
        <MyChallenges db={db} me={me} admin={admin} t={t} lang={lang} />
      </div>
      {night && nightRound && (
        <Link href="/pairing" className="card mb-6 border-accent/40 hover:border-accent/70 transition-colors flex items-center gap-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent">
            <Icon name="pawn" className="h-5 w-5" />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block font-semibold">{t.home.nightInProgress}</span>
            <span className="block text-sm text-muted">
              {fmt(t.common.roundN, { n: nightRound.number })} · {plural(nightRound.pairings.length, t.common.boardsN)} ·{" "}
              {sessionRoundComplete(db, nightRound) ? t.home.allResultsIn : fmt(t.home.stillPlaying, { n: nightPending })}
            </span>
          </span>
          <Icon name="arrow-right" className="h-4 w-4 text-muted" />
        </Link>
      )}

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <Section
          title={t.home.rankings}
          flush
          right={
            <span className="flex items-center gap-2">
              {pages > 1 && <Pager page={page} pages={pages} href={pageHref} />}
              <Link href="/h2h" className="btn btn-sm btn-ghost">
                {t.home.headToHead}
              </Link>
              <Link href="/players" className="btn btn-sm btn-ghost">
                {t.common.manage}
              </Link>
            </span>
          }
        >
          {board.length === 0 ? (
            <Empty icon="pawn" title={t.home.noPlayers}>
              <Link className="text-accent hover:underline" href="/players">
                {t.home.addFirstPlayer}
              </Link>{" "}
              {t.home.toGetStarted}
            </Empty>
          ) : (
            <div className="scroll-x">
              <table className="table">
                <thead>
                  <tr>
                    <th className="w-16">#</th>
                    <th>{t.common.player}</th>
                    <th className="text-right">{t.common.elo}</th>
                    <th className="hidden lg:table-cell">{t.common.form}</th>
                    <th className="text-right hidden lg:table-cell">{t.common.games}</th>
                    <th className="text-right">{t.common.wdl}</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((p, idx) => {
                    const i = offset + idx;
                    const trend = ratingTrend(db, p.id);
                    const st = streaks(db, p.id, byPlayer.get(p.id) ?? []);
                    return (
                      <tr key={p.id} className={`hover:bg-panel-2/50 ${p.id === me ? "bg-accent/5" : ""}`}>
                        <td>
                          <span className="inline-flex items-center gap-1.5">
                            <Rank n={i + 1} />
                            <RankMove delta={moves.get(p.id)} />
                          </span>
                        </td>
                        <td className="font-medium">
                          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <PlayerLink id={p.id} name={p.name} avatar />
                            {p.id === me && <span className="badge border-accent/40 text-accent">{t.common.you}</span>}
                            <TitleBadge title={titleFor(p)} compact />
                            <Provisional games={p.gamesPlayed} />
                            <StreakBadge streak={st.current} />
                          </span>
                        </td>
                        <td className="text-right nowrap">
                          <span className={`font-mono text-base ${i === 0 ? "text-accent" : ""}`}>{p.rating}</span>
                          {trend !== null && trend !== 0 && (
                            <span className={`block font-mono text-xs leading-tight ${trend > 0 ? "text-win" : "text-loss"}`} title={t.home.trendHint}>
                              {trend > 0 ? "+" : ""}
                              {trend}
                            </span>
                          )}
                        </td>
                        <td className="hidden lg:table-cell">
                          <FormDots results={recentForm(db, p.id)} />
                        </td>
                        <td className="text-right font-mono text-muted hidden lg:table-cell">{p.gamesPlayed}</td>
                        <td className="text-right font-mono text-xs nowrap">
                          <span className="text-win">{p.wins}</span>
                          <span className="text-muted"> / </span>
                          <span className="text-draw">{p.draws}</span>
                          <span className="text-muted"> / </span>
                          <span className="text-loss">{p.losses}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {pages > 1 && (
                <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-line text-xs text-muted">
                  <span>{fmt(t.home.playersRange, { from: offset + 1, to: offset + shown.length, total: board.length })}</span>
                  <Pager page={page} pages={pages} href={pageHref} />
                </div>
              )}
            </div>
          )}
        </Section>
        <Section title={t.home.recentGames} right={<Link href="/games" className="btn btn-sm btn-ghost">{t.common.all}</Link>}>
          {recent.length === 0 ? (
            <p className="text-sm text-muted">{t.home.noGamesHint}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line/60 -my-2 text-sm">
              {recent.map((g) => {
                const w = nameOf(names, g.whiteId);
                const b = nameOf(names, g.blackId);
                const whiteWon = g.result === "1-0" || g.result === "+/-";
                const blackWon = g.result === "0-1" || g.result === "-/+";
                return (
                  <li key={g.id} className="py-2.5 flex items-center gap-2">
                    <span className={`flex-1 min-w-0 text-right truncate ${whiteWon ? "font-semibold" : "text-muted"}`}>
                      <RatingDelta before={g.whiteRatingBefore} after={g.whiteRatingAfter} className="mr-1.5" />
                      <PlayerLink id={g.whiteId} name={w} />
                    </span>
                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-panel-2 border border-line shrink-0">{resultLabel(g.result)}</span>
                    <span className={`flex-1 min-w-0 truncate ${blackWon ? "font-semibold" : "text-muted"}`}>
                      <PlayerLink id={g.blackId} name={b} />
                      <RatingDelta before={g.blackRatingBefore} after={g.blackRatingAfter} className="ml-1.5" />
                    </span>
                    <span className="text-xs text-muted whitespace-nowrap hidden sm:inline">{g.completedAt && formatDateTime(g.completedAt, lang)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      </div>

      {/* As many columns as there are cards, so no empty third slot when there is nothing to highlight. */}
      <div className={`mt-6 grid gap-6 ${bottomCards > 1 ? "md:grid-cols-2" : ""} ${bottomCards > 2 ? "lg:grid-cols-3" : ""}`}>
        {/* Members only (a device that entered its PIN, or the admin). The club's own cards come first; the puzzle,
            a daily extra, sits last: a full row on tablets (the board wants width), a third on desktop. */}
        {showPuzzle && (
          <Section title={t.puzzle.title} className={`${bottomCards > 2 ? "md:col-span-2 lg:col-span-1" : ""} lg:order-last`}>
            <DailyPuzzle puzzle={puzzle} day={today} url={lichessPuzzleUrl(puzzle)} record={!!me} saved={savedPuzzle} />
          </Section>
        )}
        <Section title={t.home.tournaments} right={<Link href="/tournaments" className="btn btn-sm btn-ghost">{t.common.all}</Link>}>
          {open.length === 0 ? (
            <p className="text-sm text-muted">
              {t.home.nothingRunning}{" "}
              <Link className="text-accent hover:underline" href="/tournaments">
                {t.home.createOne}
              </Link>
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-line/60 -my-2">
              {open.map((tr) => (
                <li key={tr.id}>
                  <Link href={`/tournaments/${tr.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:text-accent transition-colors">
                    <span className="min-w-0">
                      <span className="block font-medium truncate">{tr.name}</span>
                      <span className="block text-xs text-muted">
                        {plural(tr.participantIds.length, t.common.playersN)} · {fmt(t.common.roundNofTotal, { n: tr.rounds.length, total: tr.plannedRounds })}
                      </span>
                    </span>
                    <StatusBadge status={tr.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>
        {hl.length > 0 && (
          <Section title={t.home.aroundTheClub} right={<Link href="/hall-of-fame" className="btn btn-sm btn-ghost">{t.home.hallOfFame}</Link>}>
            <ul className="flex flex-col gap-3 -my-1">
              {hl.map((h) => (
                <li key={h.key} className="flex items-start gap-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent">
                    <Icon name={h.icon} className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs uppercase tracking-wider text-muted">{h.title}</span>
                    <span className="block text-sm">
                      {h.playerId ? (
                        <Link href={`/players/${h.playerId}`} className="hover:text-accent">
                          {h.text}
                        </Link>
                      ) : (
                        h.text
                      )}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>
    </>
  );
}
