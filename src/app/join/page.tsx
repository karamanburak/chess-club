import { redirect } from "next/navigation";
import { localPath } from "@/lib/safe-path";
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
  const next = localPath(sp.next);
  if (await isMember()) redirect(next);
  const { t } = await getT();
  const club = (await readDb()).settings.club;
  const wrong = sp.error === "wrong";
  const locked = sp.error === "locked";

  return (
    <main className="min-h-full flex-1 flex items-center justify-center p-6 board-texture">
      <div className="w-full max-w-sm flex flex-col items-center text-center gap-6 fade-up">
        <KnightMark className="h-20 w-20 text-fg" />
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
          {locked && <p className="text-sm text-loss">{t.me.join.lockedCode}</p>}
          <SubmitButton pendingText={t.me.join.checking}>{t.me.join.enter}</SubmitButton>
          <p className="text-xs text-muted">{t.me.join.remembered}</p>
        </form>
        <QuoteOfTheDay className="max-w-sm" />
      </div>
    </main>
  );
}
