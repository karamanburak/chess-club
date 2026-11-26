import Link from "next/link";
import { answerChallenge, cancelChallenge } from "@/lib/actions";
import { effectiveStatus, involves, pendingFor, sentBy, upcoming } from "@/lib/challenges";
import { scheduledGames, type ScheduledGame } from "@/lib/schedule";
import { sameLocalDay } from "@/lib/time";
import { fmt, plural, type Dict, type Lang } from "@/lib/i18n";
import { formatDateTime, playerMap } from "@/lib/queries";
import type { Challenge, Database } from "@/lib/types";
import { ConfirmButton } from "./ConfirmButton";
import { SubmitButton } from "./SubmitButton";
import { Avatar, Pill, Section } from "./ui";

const MAX_ROWS = 6;

/** One line of the card: a challenge, or a tournament game whose two players set a date (schedule.ts). */
type Row = { at: string; c: Challenge; s?: undefined } | { at: string; s: ScheduledGame; c?: undefined };
const ofChallenge = (c: Challenge): Row => ({ at: c.at, c });
const byTime = (a: Row, b: Row) => a.at.localeCompare(b.at);

/**
 * The one challenges card on the home page: what waits for my answer, what I sent and still wait on, my agreed
 * games, and then everyone else's agreed games, so the same game never shows up in two cards. One line per
 * challenge, answerable in place. Tournament games with a date sit among the agreed ones and link to their tournament. Guests see only the club-wide part; the admin without a claimed player sees
 * every open challenge, like on /challenges. Renders nothing when there is nothing at all.
 */
export async function MyChallenges({ db, me, admin, t, lang }: { db: Database; me: string | null; admin: boolean; t: Dict; lang: Lang }) {
  const m = t.challenges;
  const names = playerMap(db);
  const personal = !!me || admin;
  const toAnswer = me ? pendingFor(db, me) : admin ? db.challenges.filter((c) => effectiveStatus(c) === "pending") : [];
  const sent = me ? sentBy(db, me) : [];
  const allAgreed = upcoming(db);
  const allGames = scheduledGames(db);
  const inGame = (s: ScheduledGame) => !!me && (s.game.whiteId === me || s.game.blackId === me);
  const agreed: Row[] = [
    ...(me ? allAgreed.filter((c) => involves(c, me)) : admin ? allAgreed : []).map(ofChallenge),
    ...(me ? allGames.filter(inGame) : admin ? allGames : []).map((s): Row => ({ at: s.at, s })),
  ].sort(byTime);
  const elsewhere: Row[] = [
    ...(me ? allAgreed.filter((c) => !involves(c, me)) : admin ? [] : allAgreed).map(ofChallenge),
    ...(me ? allGames.filter((s) => !inGame(s)) : admin ? [] : allGames).map((s): Row => ({ at: s.at, s })),
  ].sort(byTime);
  const total = toAnswer.length + sent.length + agreed.length + elsewhere.length;
  if (total === 0) return null;

  // Fill the card in order of urgency until the row budget is spent: answers first, then what I sent, then agreed games.
  type Kind = "answer" | "sent" | "agreed" | "elsewhere";
  const ordered: { title: string; items: Row[]; kind: Kind }[] = [
    { title: m.toAnswer, items: toAnswer.map(ofChallenge), kind: "answer" },
    { title: m.sent, items: sent.map(ofChallenge), kind: "sent" },
    { title: m.upcoming, items: agreed, kind: "agreed" },
    { title: personal ? m.elsewhere : m.upcomingAll, items: elsewhere, kind: "elsewhere" },
  ];
  const groups = ordered
    .map((g, i) => {
      const used = ordered.slice(0, i).reduce((n, prev) => n + prev.items.length, 0);
      return { ...g, items: g.items.slice(0, Math.max(0, MAX_ROWS - used)) };
    })
    .filter((g) => g.items.length > 0);
  // What did not fit: challenges are on /challenges, tournament games on their tournament's page.
  const shown = new Set(groups.flatMap((g) => g.items));
  const hiddenGames = [...agreed, ...elsewhere].filter((r) => r.s && !shown.has(r));
  const hiddenChallenges = total - shown.size - hiddenGames.length;

  /** The two players of a row, and the one who is not me when I am one of them. */
  const pair = (r: Row): [string, string] => (r.c ? [r.c.fromId, r.c.toId] : [r.s.game.whiteId, r.s.game.blackId]);
  const other = (r: Row) => {
    const [a, b] = pair(r);
    return me === a ? b : me === b ? a : null;
  };

  return (
    <Section
      title={
        <span className="inline-flex items-center gap-2">
          {personal ? m.mine : m.upcomingAll} <span className="badge border-accent/50 text-accent">{total}</span>
        </span>
      }
      right={
        <Link href="/challenges" className="btn btn-sm btn-ghost">
          {t.common.all}
        </Link>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        {groups.map((g) => (
          <div key={g.kind} className="flex flex-col gap-1.5">
            <div className="text-[11px] uppercase tracking-wider text-muted">{g.title}</div>
            <ul className="grid gap-1.5 md:grid-cols-2">
              {g.items.map((r) => {
                const { c, s } = r;
                const o = other(r);
                const [a, b] = pair(r);
                const today = (g.kind === "agreed" || g.kind === "elsewhere") && sameLocalDay(r.at);
                return (
                  <li key={c ? c.id : s.game.id} className={`flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-lg border px-3 py-2 ${today ? "border-accent/50 bg-accent/5" : "border-line/60"}`}>
                    {o ? (
                      <>
                        <Avatar id={o} name={names.get(o)?.name ?? "?"} size="sm" />
                        <span className="min-w-0 flex-1 truncate font-medium">{fmt(m.vs, { name: names.get(o)?.name ?? "?" })}</span>
                      </>
                    ) : (
                      <>
                        <Avatar id={a} name={names.get(a)?.name ?? "?"} size="sm" />
                        <Avatar id={b} name={names.get(b)?.name ?? "?"} size="sm" />
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {names.get(a)?.name ?? "?"} – {names.get(b)?.name ?? "?"}
                        </span>
                      </>
                    )}
                    <span className="text-xs text-muted whitespace-nowrap">
                      {formatDateTime(r.at, lang)}
                      {today && <span className="ml-1.5 text-accent font-medium">{m.today}</span>}
                    </span>
                    <span className="ml-auto flex basis-full justify-end items-center gap-1.5 sm:basis-auto">
                      {s && (
                        <Link href={`/tournaments/${s.tournament.id}`} className="badge border-line text-muted hover:text-accent max-w-[14rem] truncate">
                          {fmt(t.tournaments.schedule.where, { tournament: s.tournament.name, round: fmt(t.common.roundN, { n: s.game.round ?? 1 }) })}
                        </Link>
                      )}
                      {c?.session && <Pill tone="muted">{fmt(m.sessionPill, { duration: m.durations[String(c.session.minutes) as keyof typeof m.durations] ?? String(c.session.minutes) })}</Pill>}
                      {c && <Pill tone={c.rated ? "accent" : "muted"}>{c.rated ? m.ratedShort : t.common.unrated}</Pill>}
                      {c && g.kind === "answer" && (
                        <>
                          <form action={answerChallenge.bind(null, c.id, "accept")}>
                            <SubmitButton className="btn btn-primary btn-sm" pendingText="…">
                              {m.accept}
                            </SubmitButton>
                          </form>
                          <form action={answerChallenge.bind(null, c.id, "decline")}>
                            <SubmitButton className="btn btn-sm" pendingText="…">
                              {m.decline}
                            </SubmitButton>
                          </form>
                        </>
                      )}
                      {c && g.kind === "sent" && (
                        <>
                          <Pill tone="accent">{m.pending}</Pill>
                          <ConfirmButton action={cancelChallenge.bind(null, c.id)} className="btn btn-sm btn-ghost text-muted" confirmLabel={m.cancelConfirm}>
                            {m.cancel}
                          </ConfirmButton>
                        </>
                      )}
                      {(g.kind === "agreed" || g.kind === "elsewhere") && <Pill tone="win">{m.accepted}</Pill>}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        {(hiddenChallenges > 0 || hiddenGames.length > 0) && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            {hiddenChallenges > 0 && (
              <Link href="/challenges" className="hover:text-accent">
                {fmt(m.moreOnPage, { n: hiddenChallenges })} →
              </Link>
            )}
            {hiddenGames.length > 0 && (
              <Link href={`/tournaments/${hiddenGames[0].s!.tournament.id}`} className="hover:text-accent">
                {plural(hiddenGames.length, t.tournaments.schedule.moreGames)} →
              </Link>
            )}
          </div>
        )}
      </div>
    </Section>
  );
}
