import Link from "next/link";
import { redirect } from "next/navigation";
import { readDb } from "@/lib/db";
import { currentPlayerId } from "@/lib/auth";
import { claimWithPin, registerSelf, skipIdentity } from "@/lib/actions";
import { pinLocked } from "@/lib/pin";
import { leaderboard } from "@/lib/queries";
import { FaceSvg } from "@/components/Face";
import { SubmitButton } from "@/components/SubmitButton";
import { Empty, PageHeader, Section } from "@/components/ui";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  short: "A PIN is exactly 4 digits.",
  mismatch: "The two PINs do not match. Try again.",
  wrong: "Wrong PIN. Five wrong tries in a row lock it for ten minutes.",
  locked: "Too many wrong tries. Wait ten minutes or ask the admin for a new PIN.",
};

/**
 * "Who are you?": pick your face, prove it with your PIN, and this device
 * remembers you. No accounts, no passwords, nothing to register.
 */
export default async function MePage({ searchParams }: PageProps<"/me">) {
  const sp = await searchParams;
  const db = await readDb();
  const next = typeof sp.next === "string" && sp.next.startsWith("/") ? sp.next : "";
  const chosenId = typeof sp.player === "string" ? sp.player : null;
  const chosen = chosenId ? db.players.find((p) => p.id === chosenId) : undefined;
  const me = await currentPlayerId();
  if (chosen && me === chosen.id) redirect(next || `/players/${chosen.id}`);
  const error = typeof sp.error === "string" ? ERRORS[sp.error] : undefined;

  if (chosen) {
    const firstTime = !chosen.pinHash;
    const locked = pinLocked(chosen);
    return (
      <div className="max-w-md mx-auto">
        <PageHeader
          eyebrow={
            <Link href="/me" className="hover:text-fg">
              ← Not you? Pick again
            </Link>
          }
          title={
            <span className="flex items-center gap-4">
              <FaceSvg seed={chosen.avatar} title={chosen.name} className="h-16 w-16 rounded-full ring-1 ring-line/70" />
              {chosen.name}
            </span>
          }
        />
        <Section title={firstTime ? "Choose your PIN" : "Enter your PIN"}>
          <form action={claimWithPin} className="flex flex-col gap-3">
            <input type="hidden" name="playerId" value={chosen.id} />
            {next && <input type="hidden" name="next" value={next} />}
            <p className="text-sm text-muted">
              {firstTime
                ? "Nobody has claimed this profile yet. Pick four digits; you will need them to claim it again on another device. Only you and the admin can touch this profile afterwards."
                : "Four digits, set when this profile was first claimed. Forgot it? The admin can set a new one for you."}
            </p>
            {error && <p className="text-sm text-loss">{error}</p>}
            <div className={`grid gap-3 ${firstTime ? "grid-cols-2" : "grid-cols-1"}`}>
              <div>
                <label className="label">{firstTime ? "PIN" : "Your PIN"}</label>
                <input name="pin" type="password" inputMode="numeric" pattern="\d{4}" maxLength={4} required autoFocus autoComplete="off" disabled={locked} className="w-full font-mono text-center text-2xl tracking-[0.5em]" />
              </div>
              {firstTime && (
                <div>
                  <label className="label">Repeat</label>
                  <input name="confirm" type="password" inputMode="numeric" pattern="\d{4}" maxLength={4} required autoComplete="off" className="w-full font-mono text-center text-2xl tracking-[0.5em]" />
                </div>
              )}
            </div>
            <SubmitButton pendingText="Checking…" disabled={locked}>
              {firstTime ? "Set PIN and continue" : "This is me"}
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
        eyebrow={`Welcome to ${db.settings.club.name}`}
        title="Who are you?"
        subtitle={<span>Pick your face once and this device remembers you for a year. Your PIN keeps everyone else out of your profile.</span>}
        actions={
          <form action={skipIdentity}>
            <input type="hidden" name="next" value={next || "/"} />
            <SubmitButton className="btn btn-ghost" pendingText="…">
              Just browsing →
            </SubmitButton>
          </form>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <Section title="I am on the list" flush>
          {players.length === 0 ? (
            <Empty icon="♟" title="Nobody here yet">Be the first: join on the right.</Empty>
          ) : (
            <div className="grid gap-2 grid-cols-3 sm:grid-cols-4 md:grid-cols-5 p-4">
              {players.map((p) => (
                <Link key={p.id} href={`/me?player=${p.id}${nextQ}`} className="rounded-xl border border-line bg-panel-2/40 flex flex-col items-center gap-2 py-4 px-2 hover:border-accent/60 hover:bg-accent/5 transition-colors text-center">
                  <FaceSvg seed={p.avatar} title={p.name} className="h-16 w-16 rounded-full ring-1 ring-line/70" />
                  <span className="text-sm font-medium truncate max-w-full">{p.name}</span>
                  <span className="text-[10px] text-muted">{p.pinHash ? "PIN set" : "not claimed yet"}</span>
                </Link>
              ))}
            </div>
          )}
        </Section>
        <div className="col-stack">
          <Section title="I am new · join the club">
            <form action={registerSelf} className="flex flex-col gap-3">
              <div>
                <label className="label" htmlFor="name">
                  Your name
                </label>
                <input id="name" name="name" required minLength={2} className="w-full" placeholder="e.g. Anna" autoComplete="off" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor="pin">
                    4-digit PIN
                  </label>
                  <input id="pin" name="pin" type="password" inputMode="numeric" pattern="\d{4}" maxLength={4} required autoComplete="off" className="w-full font-mono text-center tracking-widest" />
                </div>
                <div>
                  <label className="label" htmlFor="confirm">
                    Repeat
                  </label>
                  <input id="confirm" name="confirm" type="password" inputMode="numeric" pattern="\d{4}" maxLength={4} required autoComplete="off" className="w-full font-mono text-center tracking-widest" />
                </div>
              </div>
              <p className="text-xs text-muted">Everyone starts at {db.settings.startRating} Elo. The PIN is only needed to claim your profile on another device.</p>
              <SubmitButton pendingText="Joining…">Join the club</SubmitButton>
            </form>
          </Section>
          <Section title="Why ask?">
            <ul className="text-sm text-muted flex flex-col gap-1.5 list-disc pl-4">
              <li>Your name and face sit in the header; your row is marked on the leaderboard.</li>
              <li>Only you can change your avatar and PIN. Only the admin can edit or remove players.</li>
              <li>Skipping is fine: results and pairings never need an identity.</li>
            </ul>
          </Section>
        </div>
      </div>
    </>
  );
}
