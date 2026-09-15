import { redirect } from "next/navigation";
import { readDb } from "@/lib/db";
import { isMember } from "@/lib/auth";
import { getT } from "@/lib/lang";
import { joinClub } from "@/lib/actions";
import { KnightMark } from "@/components/icons";
import { QuoteOfTheDay } from "@/components/QuoteOfTheDay";
import { SubmitButton } from "@/components/SubmitButton";

export const dynamic = "force-dynamic";

/** The front door: one shared member code, asked once per device. */
export default async function JoinPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" && sp.next.startsWith("/") ? sp.next : "/";
  if (await isMember()) redirect(next);
  const { t } = await getT();
  const club = (await readDb()).settings.club;
  const wrong = sp.error === "wrong";

  return (
    <main className="min-h-full flex-1 flex items-center justify-center p-6 board-texture">
      <div className="w-full max-w-sm flex flex-col items-center text-center gap-6 fade-up">
        <span className="grid h-20 w-20 place-items-center rounded-2xl bg-accent text-accent-fg shadow-[inset_0_-3px_0_rgba(0,0,0,.18)]">
          <KnightMark className="h-14 w-14" />
        </span>
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted">{t.me.join.membersOnly}</div>
          <h1 className="font-display text-4xl font-semibold tracking-tight mt-1">{club.name}</h1>
        </div>
        <form action={joinClub} className="card w-full flex flex-col gap-3 text-left">
          <input type="hidden" name="next" value={next} />
          <label className="label" htmlFor="code">
            {t.me.join.memberCode}
          </label>
          <input id="code" name="code" type="text" required autoFocus autoComplete="off" autoCapitalize="characters" className="w-full text-center font-mono text-lg tracking-widest" placeholder={t.me.join.placeholder} />
          {wrong && <p className="text-sm text-loss">{t.me.join.wrongCode}</p>}
          <SubmitButton pendingText={t.me.join.checking}>{t.me.join.enter}</SubmitButton>
          <p className="text-xs text-muted">{t.me.join.remembered}</p>
        </form>
        <QuoteOfTheDay className="max-w-sm" />
      </div>
    </main>
  );
}
