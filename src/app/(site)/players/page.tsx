import Link from "next/link";
import { localDay } from "@/lib/time";
import { Icon } from "@/components/icons";
import { Suspense } from "react";
import { readDb } from "@/lib/db";
import { currentPlayerId, isAdmin } from "@/lib/auth";
import { getT } from "@/lib/lang";
import { fmt, plural } from "@/lib/i18n";
import { addPlayer, registerSelf } from "@/lib/actions";
import { FaceSvg } from "@/components/Face";
import { ChallengeForm } from "@/components/ChallengeForm";
import { challengeOpponents } from "@/lib/challenges";
import { leaderboard, recentForm } from "@/lib/queries";
import { SubmitButton } from "@/components/SubmitButton";
import { SearchBox } from "@/components/SearchBox";
import { Empty, FormDots, PageHeader, PlayerLink, Provisional, Section } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function PlayersPage({ searchParams }: PageProps<"/players">) {
  const sp = await searchParams;
  const q = (typeof sp.q === "string" ? sp.q : "").toLowerCase();
  const { t } = await getT();
  const db = await readDb();
  const admin = await isAdmin();
  const meId = await currentPlayerId();
  const me = meId ? db.players.find((p) => p.id === meId) : undefined;
  const all = leaderboard(db, true);
  const players = q ? all.filter((p) => p.name.toLowerCase().includes(q)) : all;
  const active = all.filter((p) => p.active);
  const today = localDay();

  return (
    <>
      <PageHeader
        eyebrow={t.players.list.eyebrow}
        title={t.players.list.title}
        subtitle={
          <>
            <span>{fmt(t.players.list.nActive, { n: active.length })}</span>
            {all.length - active.length > 0 && <span>{fmt(t.players.list.nInactive, { n: all.length - active.length })}</span>}
          </>
        }
        actions={
          <Suspense>
            <SearchBox placeholder={t.players.list.searchPlaceholder} />
          </Suspense>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <Section title={t.players.list.allPlayers} flush right={q ? <span className="text-xs text-muted">{plural(players.length, t.players.list.nMatch)}</span> : undefined}>
          {players.length === 0 ? (
            <Empty icon="pawn" title={q ? t.players.list.noMatch : t.players.list.noPlayers}>{q ? t.players.list.tryAnother : t.players.list.useForm}</Empty>
          ) : (
            <div className="scroll-x">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t.players.list.name}</th>
                    <th className="text-right">{t.common.elo}</th>
                    <th className="text-right hidden lg:table-cell">{t.players.list.start}</th>
                    <th className="hidden xl:table-cell">{t.common.form}</th>
                    <th className="text-right">{t.common.games}</th>
                    <th className="text-right hidden md:table-cell">{t.common.wdl}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {players.map((p) => (
                    <tr key={p.id} className={`hover:bg-panel-2/50 ${p.active ? "" : "opacity-50"}`}>
                      <td className="font-medium">
                        <span className="flex items-center gap-2">
                          <PlayerLink id={p.id} name={p.name} avatar />
                          <Provisional games={p.gamesPlayed} />
                          {!p.active && <span className="badge border-muted/40 text-muted">{t.players.list.inactive}</span>}
                        </span>
                      </td>
                      <td className="text-right font-mono text-accent">{p.rating}</td>
                      <td className="text-right font-mono text-muted hidden lg:table-cell">{p.initialRating}</td>
                      <td className="hidden xl:table-cell">
                        <FormDots results={recentForm(db, p.id)} />
                      </td>
                      <td className="text-right font-mono">{p.gamesPlayed}</td>
                      <td className="text-right font-mono text-xs hidden md:table-cell nowrap">
                        <span className="text-win">{p.wins}</span> / <span className="text-draw">{p.draws}</span> / <span className="text-loss">{p.losses}</span>
                      </td>
                      <td className="text-right">
                        <Link href={`/players/${p.id}`} className="btn btn-sm btn-ghost px-2">
                          {admin ? t.players.list.edit : t.players.list.view}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        <div className="col-stack">
          {admin ? (
            <Section title={t.players.list.addPlayer}>
              <form action={addPlayer} className="flex flex-col gap-3">
                <div>
                  <label className="label" htmlFor="name">
                    {t.players.list.name}
                  </label>
                  <input id="name" name="name" required className="w-full" placeholder={t.players.list.namePlaceholder} autoComplete="off" />
                </div>
                <div>
                  <label className="label" htmlFor="rating">
                    {t.players.list.startingElo}
                  </label>
                  <input id="rating" name="rating" type="number" defaultValue={db.settings.startRating} min={100} max={3000} className="w-full" />
                  <p className="text-xs text-muted mt-1.5">{t.players.list.startingEloHint}</p>
                </div>
                <SubmitButton pendingText={t.players.list.adding}>{t.players.list.addPlayer}</SubmitButton>
              </form>
            </Section>
          ) : me ? (
            <Section title={t.players.list.you}>
              <div className="flex items-center gap-3">
                <FaceSvg seed={me.avatar} title={me.name} className="h-12 w-12 rounded-full ring-1 ring-line/70" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{me.name}</div>
                  <div className="text-xs text-muted">{t.players.list.deviceKnowsYou}</div>
                </div>
                <Link href={`/players/${me.id}`} className="btn btn-sm">
                  {t.players.list.profile}
                </Link>
              </div>
            </Section>
          ) : (
            <Section title={t.players.list.joinClub}>
              {db.settings.selfSignupOff ? (
                <p className="text-sm text-muted">{t.errors.signupClosed}</p>
              ) : (
                <form action={registerSelf} className="flex flex-col gap-3">
                  <p className="text-xs text-muted -mt-1">
                    {t.players.list.newHere}{" "}
                    <Link href="/me" className="text-accent hover:underline">
                      {t.players.list.pickYourFace}
                    </Link>{" "}
                    {t.players.list.instead}
                  </p>
                  <div>
                    <label className="label" htmlFor="name">
                      {t.players.list.yourName}
                    </label>
                    <input id="name" name="name" required minLength={2} className="w-full" placeholder={t.players.list.namePlaceholder} autoComplete="off" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label" htmlFor="pin">
                        {t.players.list.pin4}
                      </label>
                      <input id="pin" name="pin" type="password" inputMode="numeric" pattern="\d{4}" maxLength={4} required autoComplete="off" className="w-full font-mono text-center tracking-widest" />
                    </div>
                    <div>
                      <label className="label" htmlFor="confirm">
                        {t.players.list.repeat}
                      </label>
                      <input id="confirm" name="confirm" type="password" inputMode="numeric" pattern="\d{4}" maxLength={4} required autoComplete="off" className="w-full font-mono text-center tracking-widest" />
                    </div>
                  </div>
                  <p className="text-xs text-muted">{fmt(t.players.list.startHint, { rating: db.settings.startRating })}</p>
                  <SubmitButton pendingText={t.players.list.joining}>{t.players.list.joinClub}</SubmitButton>
                </form>
              )}
            </Section>
          )}

          <Section title={t.challenges.onPlayersTitle}>
            <p className="text-xs text-muted -mt-2 mb-3">{t.challenges.onPlayersHint}</p>
            {active.length < 2 ? (
              <p className="text-sm text-muted">{t.challenges.needTwo}</p>
            ) : !admin && !me ? (
              /* Only a claimed device can challenge, so an anonymous one gets a pointer instead of the form. */
              <Link href="/me" className="flex items-center gap-3 rounded-xl border border-line bg-panel-2/40 px-4 py-3 text-sm hover:border-accent/60 transition-colors">
                <Icon name="users" className="h-5 w-5 text-accent shrink-0" />
                <span>
                  {t.challenges.guest} <span className="text-accent font-medium">{t.common.whoAreYou} →</span>
                </span>
              </Link>
            ) : (
              <ChallengeForm players={challengeOpponents(db)} me={meId} admin={admin} today={today} />
            )}
          </Section>
        </div>
      </div>
    </>
  );
}
