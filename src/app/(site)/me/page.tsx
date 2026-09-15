import Link from "next/link";
import { redirect } from "next/navigation";
import { readDb } from "@/lib/db";
import { currentPlayerId } from "@/lib/auth";
import { getT } from "@/lib/lang";
import { fmt } from "@/lib/i18n";
import { claimWithPin, registerSelf, skipIdentity } from "@/lib/actions";
import { pinLocked } from "@/lib/pin";
import { leaderboard } from "@/lib/queries";
import { FaceSvg } from "@/components/Face";
import { SubmitButton } from "@/components/SubmitButton";
import { Empty, PageHeader, Section } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * "Who are you?": pick your face, prove it with your PIN, and this device
 * remembers you. No accounts, no passwords, nothing to register.
 */
export default async function MePage({ searchParams }: PageProps<"/me">) {
  const sp = await searchParams;
  const { t } = await getT();
  const db = await readDb();
  const next = typeof sp.next === "string" && sp.next.startsWith("/") ? sp.next : "";
  const chosenId = typeof sp.player === "string" ? sp.player : null;
  const chosen = chosenId ? db.players.find((p) => p.id === chosenId) : undefined;
  const me = await currentPlayerId();
  if (chosen && me === chosen.id) redirect(next || `/players/${chosen.id}`);
  const error = typeof sp.error === "string" ? t.me.errors[sp.error as keyof typeof t.me.errors] : undefined;

  if (chosen) {
    const firstTime = !chosen.pinHash;
    const locked = pinLocked(chosen);
    return (
      <div className="max-w-md mx-auto">
        <PageHeader
          eyebrow={
            <Link href="/me" className="hover:text-fg">
              {t.me.notYou}
            </Link>
          }
          title={
            <span className="flex items-center gap-4">
              <FaceSvg seed={chosen.avatar} title={chosen.name} className="h-16 w-16 rounded-full ring-1 ring-line/70" />
              {chosen.name}
            </span>
          }
        />
        <Section title={firstTime ? t.me.choosePin : t.me.enterPin}>
          <form action={claimWithPin} className="flex flex-col gap-3">
            <input type="hidden" name="playerId" value={chosen.id} />
            {next && <input type="hidden" name="next" value={next} />}
            <p className="text-sm text-muted">{firstTime ? t.me.firstTimeHint : t.me.returningHint}</p>
            {error && <p className="text-sm text-loss">{error}</p>}
            <div className={`grid gap-3 ${firstTime ? "grid-cols-2" : "grid-cols-1"}`}>
              <div>
                <label className="label">{firstTime ? t.me.pin : t.me.yourPin}</label>
                <input name="pin" type="password" inputMode="numeric" pattern="\d{4}" maxLength={4} required autoFocus autoComplete="off" disabled={locked} className="w-full font-mono text-center text-2xl tracking-[0.5em]" />
              </div>
              {firstTime && (
                <div>
                  <label className="label">{t.me.repeat}</label>
                  <input name="confirm" type="password" inputMode="numeric" pattern="\d{4}" maxLength={4} required autoComplete="off" className="w-full font-mono text-center text-2xl tracking-[0.5em]" />
                </div>
              )}
            </div>
            <SubmitButton pendingText={t.me.checking} disabled={locked}>
              {firstTime ? t.me.setPinContinue : t.me.thisIsMe}
            </SubmitButton>
          </form>
        </Section>
      </div>
    );
  }

  const players = leaderboard(db, true).filter((p) => p.active || p.id === me).sort((a, b) => a.name.localeCompare(b.name));
  const nextQ = next ? `&next=${encodeURIComponent(next)}` : "";
  return (
    <>
      <PageHeader
        eyebrow={fmt(t.me.welcome, { club: db.settings.club.name })}
        title={t.me.whoAreYou}
        subtitle={<span>{t.me.pickSubtitle}</span>}
        actions={
          <form action={skipIdentity}>
            <input type="hidden" name="next" value={next || "/"} />
            <SubmitButton className="btn btn-ghost" pendingText="…">
              {t.me.justBrowsing}
            </SubmitButton>
          </form>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <Section title={t.me.onTheList} flush>
          {players.length === 0 ? (
            <Empty icon="pawn" title={t.me.nobodyYet}>{t.me.beFirst}</Empty>
          ) : (
            <div className="grid gap-2 grid-cols-3 sm:grid-cols-4 md:grid-cols-5 p-4">
              {players.map((p) => (
                <Link key={p.id} href={`/me?player=${p.id}${nextQ}`} className="rounded-xl border border-line bg-panel-2/40 flex flex-col items-center gap-2 py-4 px-2 hover:border-accent/60 hover:bg-accent/5 transition-colors text-center">
                  <FaceSvg seed={p.avatar} title={p.name} className="h-16 w-16 rounded-full ring-1 ring-line/70" />
                  <span className="text-sm font-medium truncate max-w-full">{p.name}</span>
                  <span className="text-[10px] text-muted">{p.pinHash ? t.me.pinSet : t.me.notClaimed}</span>
                </Link>
              ))}
            </div>
          )}
        </Section>
        <div className="col-stack">
          <Section title={t.me.newJoin}>
            <form action={registerSelf} className="flex flex-col gap-3">
              <div>
                <label className="label" htmlFor="name">
                  {t.me.yourName}
                </label>
                <input id="name" name="name" required minLength={2} className="w-full" placeholder={t.me.namePlaceholder} autoComplete="off" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor="pin">
                    {t.me.pin4}
                  </label>
                  <input id="pin" name="pin" type="password" inputMode="numeric" pattern="\d{4}" maxLength={4} required autoComplete="off" className="w-full font-mono text-center tracking-widest" />
                </div>
                <div>
                  <label className="label" htmlFor="confirm">
                    {t.me.repeat}
                  </label>
                  <input id="confirm" name="confirm" type="password" inputMode="numeric" pattern="\d{4}" maxLength={4} required autoComplete="off" className="w-full font-mono text-center tracking-widest" />
                </div>
              </div>
              <p className="text-xs text-muted">{fmt(t.me.startHint, { rating: db.settings.startRating })}</p>
              <SubmitButton pendingText={t.me.joining}>{t.me.joinClub}</SubmitButton>
            </form>
          </Section>
          <Section title={t.me.whyAsk}>
            <ul className="text-sm text-muted flex flex-col gap-1.5 list-disc pl-4">
              <li>{t.me.why1}</li>
              <li>{t.me.why2}</li>
              <li>{t.me.why3}</li>
            </ul>
          </Section>
        </div>
      </div>
    </>
  );
}
