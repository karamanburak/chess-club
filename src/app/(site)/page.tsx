import Link from "next/link";
import { readDb } from "@/lib/db";
import { currentPlayerId } from "@/lib/auth";
import { currentSeason, daysUntil, highlights, seasonTable, titleFor } from "@/lib/club";
import { activeSession, completedGames, formatDateTime, leaderboard, playerMap, rankChanges, recentForm, ratingTrend, resultLabel, sessionRoundComplete, streaks } from "@/lib/queries";
import { Avatar, Empty, FormDots, PlayerLink, Provisional, Rank, RankMove, RatingDelta, Section, StatusBadge, StreakBadge, TitleBadge } from "@/components/ui";
import { Icon, KnightMark } from "@/components/icons";
import { QuoteOfTheDay } from "@/components/QuoteOfTheDay";

export const dynamic = "force-dynamic";

const PAGE = 10;

export default async function Home({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const db = await readDb();
  const board = leaderboard(db);
  const pages = Math.max(1, Math.ceil(board.length / PAGE));
  const page = Math.min(pages, Math.max(1, Number(sp.page) || 1));
  const offset = (page - 1) * PAGE;
  const shown = board.slice(offset, offset + PAGE);
  const names = playerMap(db);
  const played = completedGames(db);
  const recent = played.slice(0, 8);
  const open = db.tournaments.filter((t) => t.status !== "finished").sort((a, b) => b.date.localeCompare(a.date));
  const top = board[0];
  const night = activeSession(db);
  const nightRound = night?.rounds[night.rounds.length - 1];
  const nightPending = nightRound ? nightRound.pairings.filter((p) => !db.games.find((g) => g.id === p.gameId)?.result).length : 0;
  const moves = rankChanges(db);
  const club = db.settings.club;
  const season = currentSeason(db);
  const leader = season ? (seasonTable(db, season).find((r) => r.games >= 3) ?? null) : null;
  const next = daysUntil(club.nextNight);
  const nextLabel = next === null || next < 0 ? null : next === 0 ? "tonight" : next === 1 ? "tomorrow" : `in ${next} days`;
  const hl = highlights(db);
  const me = await currentPlayerId();

  return (
    <>
      <section className="card board-texture mb-6 relative overflow-hidden p-6 md:p-8">
        <KnightMark className="pointer-events-none select-none absolute -right-8 -top-8 h-64 w-64 text-fg opacity-[0.05]" style={{ ["--knight-eye" as string]: "transparent" }} />
        <div className="relative flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0 flex items-start gap-5">
            <span className="hidden sm:grid h-20 w-20 place-items-center rounded-2xl bg-accent text-accent-fg shadow-[inset_0_-3px_0_rgba(0,0,0,.18)] shrink-0">
              <KnightMark className="h-14 w-14" />
            </span>
            <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted flex flex-wrap gap-x-2">
              {club.founded && <span>Est. {club.founded}</span>}
              {season && <span>{club.founded ? "· " : ""}{season.name}</span>}
            </div>
            <h1 className="font-display text-4xl md:text-5xl font-semibold tracking-tight mt-1 leading-none">{club.name}</h1>
            <QuoteOfTheDay className="mt-3 max-w-2xl" />
            <div className="flex flex-wrap gap-2 mt-4 text-sm">
              {club.meets && <span className="badge border-line text-muted py-1 px-2.5">📍 {club.meets}</span>}
              {nextLabel && <span className="badge border-accent/40 text-accent py-1 px-2.5"><Icon name="pawn" className="h-3.5 w-3.5" /> Next club night {nextLabel}</span>}
              {leader && (
                <Link href="/hall-of-fame" className="badge border-line py-1 px-2.5 hover:border-accent/60">
                  <Icon name="crown" className="h-3.5 w-3.5 text-accent" /> {season?.name} leader: <span className="font-medium">{names.get(leader.playerId)?.name}</span> · {leader.points} pts
                </Link>
              )}
            </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <Link href="/pairing" className="btn btn-primary">
              <Icon name="pawn" className="h-4 w-4" /> {night ? "Back to club night" : "Start club night"}
            </Link>
            <Link href="/tournaments" className="btn">
              New tournament
            </Link>
          </div>
        </div>
        {club.announcement && <div className="relative mt-5 rounded-xl border border-accent/30 bg-accent/10 px-4 py-2.5 text-sm flex items-start gap-2"><Icon name="pin" className="h-4 w-4 mt-0.5 shrink-0 text-accent" /> <span>{club.announcement}</span></div>}
      </section>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="stat">
          <span className="stat-label">Active players</span>
          <span className="stat-value">{board.length}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Games played</span>
          <span className="stat-value">{played.length}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Tournaments</span>
          <span className="stat-value">
            {db.tournaments.length}
            {open.length > 0 && <span className="text-sm text-accent ml-2">{open.length} live</span>}
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">Top rated</span>
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

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <Section
          title="Rankings"
          flush
          right={
            <span className="flex items-center gap-2">
              {pages > 1 && <Pager page={page} pages={pages} />}
              <Link href="/h2h" className="btn btn-sm btn-ghost">
                Head-to-head
              </Link>
              <Link href="/players" className="btn btn-sm btn-ghost">
                Manage →
              </Link>
            </span>
          }
        >
          {board.length === 0 ? (
            <Empty icon="♞" title="No players yet">
              <Link className="text-accent hover:underline" href="/players">
                Add the first player
              </Link>{" "}
              to get started.
            </Empty>
          ) : (
            <div className="scroll-x">
              <table className="table">
                <thead>
                  <tr>
                    <th className="w-16">#</th>
                    <th>Player</th>
                    <th className="text-right">Elo</th>
                    <th className="hidden md:table-cell">Form</th>
                    <th className="text-right hidden md:table-cell">Games</th>
                    <th className="text-right">W / D / L</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((p, idx) => {
                    const i = offset + idx;
                    const trend = ratingTrend(db, p.id);
                    const st = streaks(db, p.id);
                    return (
                      <tr key={p.id} className={`hover:bg-panel-2/50 ${p.id === me ? "bg-accent/5" : ""}`}>
                        <td>
                          <span className="inline-flex items-center gap-1.5">
                            <Rank n={i + 1} />
                            <RankMove delta={moves.get(p.id)} />
                          </span>
                        </td>
                        <td className="font-medium">
                          <span className="flex items-center gap-2 nowrap">
                            <PlayerLink id={p.id} name={p.name} avatar />
                            {p.id === me && <span className="badge border-accent/40 text-accent">you</span>}
                            <TitleBadge title={titleFor(p)} compact />
                            <Provisional games={p.gamesPlayed} />
                            <StreakBadge streak={st.current} />
                          </span>
                        </td>
                        <td className="text-right nowrap">
                          <span className={`font-mono text-base ${i === 0 ? "text-accent" : ""}`}>{p.rating}</span>
                          {trend !== null && trend !== 0 && (
                            <span className={`block font-mono text-[11px] leading-tight ${trend > 0 ? "text-win" : "text-loss"}`} title="Rating change over the last 5 games">
                              {trend > 0 ? "+" : ""}
                              {trend}
                            </span>
                          )}
                        </td>
                        <td className="hidden md:table-cell">
                          <FormDots results={recentForm(db, p.id)} />
                        </td>
                        <td className="text-right font-mono text-muted hidden md:table-cell">{p.gamesPlayed}</td>
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
                  <span>
                    Players {offset + 1}–{offset + shown.length} of {board.length}
                  </span>
                  <Pager page={page} pages={pages} />
                </div>
              )}
            </div>
          )}
        </Section>

        <div className="col-stack">
          {hl.length > 0 && (
            <Section title="Around the club" right={<Link href="/hall-of-fame" className="btn btn-sm btn-ghost">Hall of Fame →</Link>}>
              <ul className="flex flex-col gap-3 -my-1">
                {hl.map((h) => (
                  <li key={h.key} className="flex items-start gap-3">
                    <span className="text-2xl leading-none mt-0.5" aria-hidden>
                      {h.icon}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[11px] uppercase tracking-wider text-muted">{h.title}</span>
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
          {night && nightRound && (
            <Link href="/pairing" className="card border-accent/40 hover:border-accent/70 transition-colors flex items-center gap-4">
              <span className="text-3xl">♟</span>
              <span className="flex-1 min-w-0">
                <span className="block font-semibold">Club night in progress</span>
                <span className="block text-sm text-muted">
                  Round {nightRound.number} · {nightRound.pairings.length} boards ·{" "}
                  {sessionRoundComplete(db, nightRound) ? "all results in" : `${nightPending} still playing`}
                </span>
              </span>
              <span className="text-muted">→</span>
            </Link>
          )}

          <Section title="Tournaments" right={<Link href="/tournaments" className="btn btn-sm btn-ghost">All →</Link>}>
            {open.length === 0 ? (
              <p className="text-sm text-muted">
                Nothing running.{" "}
                <Link className="text-accent hover:underline" href="/tournaments">
                  Create one.
                </Link>
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-line/60 -my-2">
                {open.map((t) => (
                  <li key={t.id}>
                    <Link href={`/tournaments/${t.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:text-accent transition-colors">
                      <span className="min-w-0">
                        <span className="block font-medium truncate">{t.name}</span>
                        <span className="block text-xs text-muted">
                          {t.participantIds.length} players · round {t.rounds.length} of {t.plannedRounds}
                        </span>
                      </span>
                      <StatusBadge status={t.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Recent games" right={<Link href="/games" className="btn btn-sm btn-ghost">All →</Link>}>
            {recent.length === 0 ? (
              <p className="text-sm text-muted">No games recorded yet.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-line/60 -my-2 text-sm">
                {recent.map((g) => {
                  const w = names.get(g.whiteId)?.name ?? "?";
                  const b = names.get(g.blackId)?.name ?? "?";
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
                      <span className="text-[11px] text-muted whitespace-nowrap hidden sm:inline">{g.completedAt && formatDateTime(g.completedAt)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
        </div>
      </div>
    </>
  );
}

function Pager({ page, pages }: { page: number; pages: number }) {
  const href = (n: number) => (n <= 1 ? "/" : `/?page=${n}`);
  return (
    <span className="inline-flex items-center gap-1 text-xs">
      <Link href={href(page - 1)} className={`btn btn-sm ${page === 1 ? "pointer-events-none opacity-40" : ""}`} aria-label="Previous page">
        ←
      </Link>
      <span className="text-muted px-2 font-mono">
        {page} / {pages}
      </span>
      <Link href={href(page + 1)} className={`btn btn-sm ${page === pages ? "pointer-events-none opacity-40" : ""}`} aria-label="Next page">
        →
      </Link>
    </span>
  );
}
