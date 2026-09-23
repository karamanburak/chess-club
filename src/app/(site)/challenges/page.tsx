import type { Metadata } from "next";
import Link from "next/link";
import { localDay } from "@/lib/time";
import { readDb } from "@/lib/db";
import { currentPlayerId, isAdmin } from "@/lib/auth";
import { getT } from "@/lib/lang";
import { fmt, plural } from "@/lib/i18n";
import { challengeOpponents, clubChallenges, clubGroup, effectiveStatus, history, involves, isClubFilter, pendingFor, sentBy, upcoming, type ClubFilter } from "@/lib/challenges";
import { playerMap } from "@/lib/queries";
import { ChallengeCard } from "@/components/ChallengeCard";
import { ChallengeForm } from "@/components/ChallengeForm";
import { Foldable } from "@/components/Foldable";
import { GuestNotice } from "@/components/GuestNotice";
import { Icon } from "@/components/icons";
import { Empty, PageHeader, Section } from "@/components/ui";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t.challenges.title };
}

/** Longest list per group in the admin's club view; the filter narrows the rest. */
const CLUB_GROUP_MAX = 40;

/**
 * Arrange games: what waits for me, what I sent, what is agreed, what is settled. The admin also gets the whole
 * club (`?view=club`, filter by `status` and `player`), which is the only view for an admin device that claimed no one.
 */
export default async function ChallengesPage({ searchParams }: PageProps<"/challenges">) {
  const sp = await searchParams;
  const { t, lang } = await getT();
  const db = await readDb();
  const admin = await isAdmin();
  const me = await currentPlayerId();
  const names = playerMap(db);
  const m = t.challenges;

  const games = new Map(db.games.map((g) => [g.id, g]));
  const card = (c: (typeof db.challenges)[number]) => <ChallengeCard key={c.id} c={c} names={names} me={me} admin={admin} t={t} lang={lang} clubName={db.settings.club.name} games={games} />;
  // Everyone sees what the club has agreed on (the home page shows it too); the personal lists need a claimed device.
  const all = upcoming(db);
  const mine = me ? all.filter((c) => involves(c, me)) : admin ? all : [];
  const others = me ? all.filter((c) => !involves(c, me)) : admin ? [] : all;

  if (!admin && !me) {
    return (
      <>
        <PageHeader eyebrow={m.eyebrow} title={m.title} subtitle={<span>{m.intro}</span>} />
        <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
          <Section title={m.upcomingAll}>
            {others.length === 0 ? <Empty icon="swords" title={m.noUpcoming} /> : <ul className="flex flex-col gap-3">{others.map(card)}</ul>}
          </Section>
          <div className="col-stack">
            <GuestNotice />
          </div>
        </div>
      </>
    );
  }

  const clubView = admin && (sp.view === "club" || !me);
  const status: ClubFilter = isClubFilter(sp.status) ? sp.status : "all";
  const playerId = typeof sp.player === "string" && names.has(sp.player) ? sp.player : null;
  const clubHref = (over: { status?: ClubFilter; player?: string | null }) => {
    const q = new URLSearchParams({ view: "club" });
    const st = over.status ?? status;
    const pl = over.player === undefined ? playerId : over.player;
    if (st !== "all") q.set("status", st);
    if (pl) q.set("player", pl);
    return `/challenges?${q.toString()}`;
  };

  const toAnswer = me ? pendingFor(db, me) : db.challenges.filter((c) => c.status === "pending");
  const sent = me ? sentBy(db, me) : [];
  const settled = me ? history(db, me) : [];
  const played = settled.filter((c) => effectiveStatus(c) === "played").slice(0, 10);
  const quiet = settled.filter((c) => effectiveStatus(c) !== "played").slice(0, 10);

  /** Admin: every challenge of the club, grouped like the personal view, filtered by status and player. */
  const clubOverview = () => {
    const list = clubChallenges(db, { status, playerId });
    const groups = (["pending", "accepted", "played", "settled"] as const).filter((g) => status === "all" || status === g);
    const title = { pending: m.groupPending, accepted: m.groupAccepted, played: m.groupPlayed, settled: m.groupSettled };
    const tabs: [ClubFilter, string][] = [
      ["all", m.filterAll],
      ["pending", m.groupPending],
      ["accepted", m.groupAccepted],
      ["played", m.groupPlayed],
      ["settled", m.groupSettled],
    ];
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3 no-print">
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label={m.filterStatus}>
            {tabs.map(([k, l]) => (
              <Link key={k} href={clubHref({ status: k })} className={`btn btn-sm ${status === k ? "btn-primary" : ""}`} aria-current={status === k ? "page" : undefined}>
                {l}
              </Link>
            ))}
          </div>
          {/* A plain GET form: works without JavaScript and keeps the address shareable. */}
          <form action="/challenges" className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="view" value="club" />
            {status !== "all" && <input type="hidden" name="status" value={status} />}
            <div className="flex flex-col gap-1">
              <label htmlFor="f-club-player" className="label">
                {m.filterPlayer}
              </label>
              <select id="f-club-player" name="player" defaultValue={playerId ?? ""} className="min-w-48">
                <option value="">{m.filterEveryone}</option>
                {[...db.players]
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </div>
            <button type="submit" className="btn btn-sm">
              {m.filterApply}
            </button>
            <span className="ml-auto text-xs text-muted">{plural(list.length, m.clubTotal)}</span>
          </form>
        </div>
        {list.length === 0 && <Empty icon="swords" title={m.none} />}
        {groups.map((g) => {
          const items = list.filter((c) => clubGroup(c) === g);
          if (items.length === 0) return null;
          const shown = items.slice(0, CLUB_GROUP_MAX);
          return (
            <Section key={g} title={title[g]} right={<span className="badge border-line text-muted">{items.length}</span>}>
              <ul className={`flex flex-col ${g === "settled" ? "gap-2" : "gap-3"}`}>{shown.map(card)}</ul>
              {items.length > shown.length && <p className="mt-3 text-xs text-muted">{fmt(m.clubMore, { n: items.length - shown.length })}</p>}
            </Section>
          );
        })}
      </div>
    );
  };

  return (
    <>
      <PageHeader eyebrow={m.eyebrow} title={m.title} subtitle={<span>{m.intro}</span>} />
      {admin && me && (
        <div className="flex flex-wrap items-center gap-2 mb-4 no-print" role="group" aria-label={m.viewLabel}>
          <Link href="/challenges" className={`btn btn-sm ${clubView ? "" : "btn-primary"}`} aria-current={clubView ? undefined : "page"}>
            {m.viewMine}
          </Link>
          <Link href={clubHref({})} className={`btn btn-sm ${clubView ? "btn-primary" : ""}`} aria-current={clubView ? "page" : undefined}>
            <Icon name="shield" className="h-3.5 w-3.5" /> {m.viewClub}
          </Link>
        </div>
      )}
      {/* Top-aligned like the home page: the form column is short and the lists grow with club life; stretching would leave a void. */}
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr] lg:items-start">
        {clubView ? (
          clubOverview()
        ) : (
        <div className="flex flex-col gap-6">
          {/* Empty groups stay out of the way; only when there is nothing at all does one quiet card say so. */}
          {toAnswer.length + mine.length + sent.length + others.length + played.length === 0 && <Empty icon="swords" title={m.noUpcoming} />}
          {toAnswer.length > 0 && (
            <Section title={m.toAnswer} right={<span className="badge border-accent/50 text-accent">{toAnswer.length}</span>}>
              <ul className="flex flex-col gap-3">{toAnswer.map(card)}</ul>
            </Section>
          )}
          {mine.length > 0 && (
            <Section title={m.upcoming}>
              <ul className="flex flex-col gap-3">{mine.map(card)}</ul>
            </Section>
          )}
          {sent.length > 0 && (
            <Section title={m.sent}>
              <ul className="flex flex-col gap-3">{sent.map(card)}</ul>
            </Section>
          )}
          {others.length > 0 && (
            <Section title={m.upcomingAll}>
              <ul className="flex flex-col gap-3">{others.map(card)}</ul>
            </Section>
          )}
          {played.length > 0 && (
            <Section title={m.playedTitle}>
              <ul className="flex flex-col gap-3">{played.map(card)}</ul>
            </Section>
          )}
          {quiet.length > 0 && (
            // Nothing came of these; one folded line, so they neither vanish nor take room from the games.
            <details className="group px-1">
              <summary className="cursor-pointer list-none inline-flex items-center gap-2 text-sm text-muted hover:text-fg">
                <Icon name="chevron" className="h-3.5 w-3.5 -rotate-90 transition-transform group-open:rotate-0" />
                {fmt(m.settledCount, { n: quiet.length })}
              </summary>
              <ul className="mt-3 flex flex-col gap-2">{quiet.map(card)}</ul>
            </details>
          )}
        </div>
        )}
        {/* On a phone the form comes first but folded, so the lists stay in view; on desktop it is the open right column. */}
        <div className="flex flex-col gap-6 order-first lg:order-none">
          <Foldable title={m.new} hint={m.tapToOpen}>
            <ChallengeForm players={challengeOpponents(db)} me={me} admin={admin} today={localDay()} />
          </Foldable>
        </div>
      </div>
    </>
  );
}
