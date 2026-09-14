import Link from "next/link";
import { Suspense } from "react";
import { readDb } from "@/lib/db";
import { currentPlayerId, isAdmin } from "@/lib/auth";
import { addPlayer, recordFriendlyGame, registerSelf } from "@/lib/actions";
import { FaceSvg } from "@/components/Face";
import { leaderboard, recentForm } from "@/lib/queries";
import { SubmitButton } from "@/components/SubmitButton";
import { SearchBox } from "@/components/SearchBox";
import { Empty, FormDots, PageHeader, PlayerLink, Provisional, Section } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function PlayersPage({ searchParams }: PageProps<"/players">) {
  const sp = await searchParams;
  const q = (typeof sp.q === "string" ? sp.q : "").toLowerCase();
  const db = await readDb();
  const admin = await isAdmin();
  const meId = await currentPlayerId();
  const me = meId ? db.players.find((p) => p.id === meId) : undefined;
  const all = leaderboard(db, true);
  const players = q ? all.filter((p) => p.name.toLowerCase().includes(q)) : all;
  const active = all.filter((p) => p.active);
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  return (
    <>
      <PageHeader
        eyebrow="Members"
        title="Players"
        subtitle={
          <>
            <span>{active.length} active</span>
            {all.length - active.length > 0 && <span>· {all.length - active.length} inactive</span>}
          </>
        }
        actions={
          <Suspense>
            <SearchBox placeholder="Search players…" />
          </Suspense>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <Section title="All players" flush right={q ? <span className="text-xs text-muted">{players.length} match</span> : undefined}>
          {players.length === 0 ? (
            <Empty icon="♞" title={q ? "No match" : "No players yet"}>{q ? "Try another name." : "Use the form to add your first club member."}</Empty>
          ) : (
            <div className="scroll-x">
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th className="text-right">Elo</th>
                    <th className="text-right hidden sm:table-cell">Start</th>
                    <th className="hidden md:table-cell">Form</th>
                    <th className="text-right">Games</th>
                    <th className="text-right hidden sm:table-cell">W / D / L</th>
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
                          {!p.active && <span className="badge border-muted/40 text-muted">inactive</span>}
                        </span>
                      </td>
                      <td className="text-right font-mono text-accent">{p.rating}</td>
                      <td className="text-right font-mono text-muted hidden sm:table-cell">{p.initialRating}</td>
                      <td className="hidden md:table-cell">
                        <FormDots results={recentForm(db, p.id)} />
                      </td>
                      <td className="text-right font-mono">{p.gamesPlayed}</td>
                      <td className="text-right font-mono text-xs hidden sm:table-cell nowrap">
                        <span className="text-win">{p.wins}</span> / <span className="text-draw">{p.draws}</span> / <span className="text-loss">{p.losses}</span>
                      </td>
                      <td className="text-right">
                        <Link href={`/players/${p.id}`} className="btn btn-sm btn-ghost">
                          {admin ? "Edit" : "View"} →
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
            <Section title="Add player">
              <form action={addPlayer} className="flex flex-col gap-3">
                <div>
                  <label className="label" htmlFor="name">
                    Name
                  </label>
                  <input id="name" name="name" required className="w-full" placeholder="e.g. Anna" autoComplete="off" />
                </div>
                <div>
                  <label className="label" htmlFor="rating">
                    Starting Elo
                  </label>
                  <input id="rating" name="rating" type="number" defaultValue={db.settings.startRating} min={100} max={3000} className="w-full" />
                  <p className="text-xs text-muted mt-1.5">Unknown strength? Keep the default. New players adjust quickly (K = 40 for the first 30 games).</p>
                </div>
                <SubmitButton pendingText="Adding…">Add player</SubmitButton>
              </form>
            </Section>
          ) : me ? (
            <Section title="You">
              <div className="flex items-center gap-3">
                <FaceSvg seed={me.avatar} title={me.name} className="h-12 w-12 rounded-full ring-1 ring-line/70" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{me.name}</div>
                  <div className="text-xs text-muted">This device knows you. New members join from their own device.</div>
                </div>
                <Link href={`/players/${me.id}`} className="btn btn-sm">
                  Profile →
                </Link>
              </div>
            </Section>
          ) : (
            <Section title="Join the club">
              <form action={registerSelf} className="flex flex-col gap-3">
                <p className="text-xs text-muted -mt-1">
                  New here? Add yourself once. Already on the list?{" "}
                  <Link href="/me" className="text-accent hover:underline">
                    Pick your face
                  </Link>{" "}
                  instead.
                </p>
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
                <p className="text-xs text-muted">You start at {db.settings.startRating} Elo like everyone. The PIN lets you claim your profile on another device; only you and the admin can change it.</p>
                <SubmitButton pendingText="Joining…">Join the club</SubmitButton>
              </form>
            </Section>
          )}

          <Section title="Record a friendly game">
            <p className="text-xs text-muted -mt-2 mb-3">A single game outside a tournament or club night. Counts for Elo unless unrated.</p>
            {active.length < 2 ? (
              <p className="text-sm text-muted">Add at least two players first.</p>
            ) : (
              <form action={recordFriendlyGame} className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">⚪ White</label>
                    <select name="whiteId" required className="w-full">
                      {active.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.rating})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label">⚫ Black</label>
                    <select name="blackId" required className="w-full" defaultValue={active[1]?.id}>
                      {active.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.rating})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="label">Result</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      ["1-0", "1–0", "White wins"],
                      ["1/2-1/2", "½–½", "Draw"],
                      ["0-1", "0–1", "Black wins"],
                    ].map(([v, l, d], i) => (
                      <label key={v} className="chip flex-col items-center gap-0.5 py-2">
                        <input type="radio" name="result" value={v} defaultChecked={i === 0} className="sr-only" />
                        <span className="font-mono font-medium">{l}</span>
                        <span className="text-[11px] text-muted">{d}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 items-end">
                  <div>
                    <label className="label" htmlFor="friendly-date">
                      Played on
                    </label>
                    <input id="friendly-date" name="date" type="date" defaultValue={today} max={today} className="w-full" />
                  </div>
                  <label className="flex items-center gap-2 text-sm pb-2">
                    <input type="checkbox" name="rated" value="on" defaultChecked /> Rated
                  </label>
                </div>
                <input type="hidden" name="rated" value="off" />
                <p className="text-xs text-muted -mt-1">Backdated games slot into the Elo history at that date, so ratings are replayed in the right order.</p>
                <SubmitButton pendingText="Saving…">Save game</SubmitButton>
              </form>
            )}
          </Section>
        </div>
      </div>
    </>
  );
}
