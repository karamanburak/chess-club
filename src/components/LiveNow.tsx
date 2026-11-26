import Link from "next/link";
import type { ReactNode } from "react";
import { fmt, plural, type Dict, type Lang } from "@/lib/i18n";
import { activeSession, formatDate, playerMap, sessionRoundComplete } from "@/lib/queries";
import { deadlineState } from "@/lib/schedule";
import { nameOf } from "@/lib/score";
import { dayOf, localDay } from "@/lib/time";
import type { Database, Tournament } from "@/lib/types";
import { Icon, type IconName } from "./icons";
import { tournamentView } from "./tournament/view";
import { Pill, StatusBadge } from "./ui";

/** More running tournaments than this are rare; the rest are on the Tournaments card further down. */
const MAX_TOURNAMENTS = 3;

/**
 * What is being played right now, first thing under the hero of the home page: the open club night and every
 * running tournament (planned ones are not "live"), each one tap away. A claimed player also reads their own
 * board of the current round there. Renders nothing while nothing runs. Guests see it too, read-only.
 */
export function LiveNow({ db, me, t, lang }: { db: Database; me: string | null; t: Dict; lang: Lang }) {
  const night = activeSession(db);
  const nightRound = night?.rounds[night.rounds.length - 1];
  const running = db.tournaments
    .filter((x) => x.status === "running")
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, MAX_TOURNAMENTS);
  const showNight = !!night && !!nightRound;
  const count = running.length + (showNight ? 1 : 0);
  if (count === 0) return null;
  const names = playerMap(db);
  const games = new Map(db.games.map((g) => [g.id, g]));
  const h = t.home;

  /** The claimed player's own board in the current round: opponent, the bye, or nothing when they sit this round out. */
  const myBoard = (tr: Tournament): ReactNode => {
    const last = tr.rounds[tr.rounds.length - 1];
    if (!me || !last) return null;
    if (last.byePlayerId === me) return <span className="text-fg">{h.liveBye}</span>;
    const p = last.pairings.find((x) => x.board > 0 && (x.whiteId === me || x.blackId === me));
    const g = p && games.get(p.gameId);
    if (!p || !g || g.result) return null;
    // Rounds that run over days (a deadline, a dated board, or simply not paired today): a board without a date
    // is the one thing to act on. A dated one already sits in the strip below, so its time is not repeated here.
    const spread = !!last.deadline || last.pairings.some((x) => games.get(x.gameId)?.scheduledAt) || dayOf(last.createdAt) !== localDay();
    return (
      <span className="text-fg">
        {fmt(h.liveYouPlay, { name: nameOf(names, p.whiteId === me ? p.blackId : p.whiteId) })}
        {spread && !g.scheduledAt && <span className="text-accent font-medium"> · {h.liveNoDate}</span>}
      </span>
    );
  };

  return (
    <div className={`mb-6 grid gap-3 ${count > 1 ? "md:grid-cols-2" : ""}`}>
      {showNight && (
        <LiveCard href="/pairing" icon="pawn" title={h.nightInProgress}>
          <span>
            {fmt(t.common.roundN, { n: nightRound.number })} · {plural(nightRound.pairings.length, t.common.boardsN)} ·{" "}
            {sessionRoundComplete(db, nightRound)
              ? h.allResultsIn
              : fmt(h.stillPlaying, { n: nightRound.pairings.filter((p) => !games.get(p.gameId)?.result).length })}
          </span>
        </LiveCard>
      )}
      {running.map((tr) => {
        const v = tournamentView(db, tr, names, t);
        const due = v.last && !v.lastComplete ? deadlineState(v.last) : null;
        const state = !v.last
          ? h.liveNoRound
          : !v.lastComplete
            ? fmt(h.stillPlaying, { n: v.playing })
            : v.koUndecided > 0
              ? plural(v.koUndecided, t.tournaments.tiebreaksPending)
              : v.canGenerate
                ? h.liveNextRound
                : v.roundsLeft <= 0
                  ? h.liveLastRoundDone
                  : h.allResultsIn;
        const mine = myBoard(tr);
        return (
          <LiveCard key={tr.id} href={`/tournaments/${tr.id}`} icon="trophy" title={tr.name}>
            <span>
              {v.last && <>{v.roundTitle(v.last.number)} · </>}
              {state}
            </span>
            {due && v.last?.deadline && (
              <Pill tone={due.state === "overdue" ? "loss" : due.state === "open" ? "muted" : "accent"}>
                {due.state === "overdue"
                  ? fmt(t.tournaments.schedule.overdue, { date: formatDate(v.last.deadline, lang) })
                  : due.state === "today"
                    ? t.tournaments.schedule.playByToday
                    : fmt(t.tournaments.schedule.playBy, { date: formatDate(v.last.deadline, lang) })}
              </Pill>
            )}
            {mine && <span className="basis-full">{mine}</span>}
          </LiveCard>
        );
      })}
    </div>
  );
}

function LiveCard({ href, icon, title, children }: { href: string; icon: IconName; title: string; children: ReactNode }) {
  return (
    <Link href={href} className="card border-accent/40 hover:border-accent/70 transition-colors flex items-center gap-4">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent">
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="flex items-center gap-2">
          <span className="font-semibold truncate">{title}</span>
          <StatusBadge status="running" />
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">{children}</span>
      </span>
      <Icon name="arrow-right" className="h-4 w-4 shrink-0 text-muted" />
    </Link>
  );
}
