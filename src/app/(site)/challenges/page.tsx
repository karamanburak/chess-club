import type { Metadata } from "next";
import { readDb } from "@/lib/db";
import { currentPlayerId, isAdmin } from "@/lib/auth";
import { getT } from "@/lib/lang";
import { effectiveStatus, history, involves, pendingFor, sentBy, upcoming } from "@/lib/challenges";
import { playerMap } from "@/lib/queries";
import { ChallengeCard, ChallengeForm } from "@/components/ChallengeCard";
import { GuestNotice } from "@/components/GuestNotice";
import { Empty, PageHeader, Section } from "@/components/ui";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t.challenges.title };
}

/** Arrange games: what waits for me, what I sent, what is agreed, what is settled. */
export default async function ChallengesPage() {
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

  const toAnswer = me ? pendingFor(db, me) : db.challenges.filter((c) => c.status === "pending");
  const sent = me ? sentBy(db, me) : [];
  const settled = me ? history(db, me) : [];
  const played = settled.filter((c) => effectiveStatus(c) === "played").slice(0, 10);
  const quiet = settled.filter((c) => effectiveStatus(c) !== "played").slice(0, 10);

  return (
    <>
      <PageHeader eyebrow={m.eyebrow} title={m.title} subtitle={<span>{m.intro}</span>} />
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="col-stack">
          <Section title={m.toAnswer} right={toAnswer.length > 0 ? <span className="badge border-accent/50 text-accent">{toAnswer.length}</span> : undefined}>
            {toAnswer.length === 0 ? <p className="text-sm text-muted">{m.none}</p> : <ul className="flex flex-col gap-3">{toAnswer.map(card)}</ul>}
          </Section>
          <Section title={m.upcoming}>
            {mine.length === 0 ? <Empty icon="swords" title={m.noUpcoming} /> : <ul className="flex flex-col gap-3">{mine.map(card)}</ul>}
          </Section>
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
        </div>
        <div className="col-stack">
          <Section title={m.new}>
            <ChallengeForm players={db.players} me={me} admin={admin} t={t} />
          </Section>
          {played.length > 0 && (
            <Section title={m.playedTitle}>
              <ul className="flex flex-col gap-3">{played.map(card)}</ul>
            </Section>
          )}
          {quiet.length > 0 && (
            <Section title={m.settledTitle}>
              <ul className="flex flex-col gap-2">{quiet.map(card)}</ul>
            </Section>
          )}
        </div>
      </div>
    </>
  );
}
