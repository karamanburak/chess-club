import Link from "next/link";
import { readDb } from "@/lib/db";
import { createTournament } from "@/lib/actions";
import { formatDate, leaderboard, standings, TIEBREAK_PRESETS } from "@/lib/queries";
import { SubmitButton } from "@/components/SubmitButton";
import { Avatar, Empty, PageHeader, Section, StatusBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

const MODES = [
  { value: "random", label: "Random", help: "Anyone can meet anyone. Rematches avoided, colors balanced." },
  { value: "swiss", label: "Swiss", help: "Players on similar scores meet. Standard for larger groups." },
  { value: "roundrobin", label: "Round robin", help: "Everyone plays everyone once. Best for up to ~10 players." },
  { value: "knockout", label: "Knockout", help: "Seeded bracket by rating: round of 16 → quarterfinals → semifinals → final. Ties get a tiebreak game." },
];

export default async function TournamentsPage() {
  const db = await readDb();
  const list = [...db.tournaments].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const players = leaderboard(db);
  const suggestedRounds = Math.max(3, Math.min(7, Math.ceil(Math.log2(Math.max(players.length, 2))) + 1));

  return (
    <>
      <PageHeader eyebrow="Compete" title="Tournaments" subtitle={<span>{list.length} total</span>} />

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="flex flex-col gap-3">
          {list.length === 0 ? (
            <div className="card">
              <Empty icon="♜" title="No tournaments yet">Create one on the right. Pairings and colors are handled for you.</Empty>
            </div>
          ) : (
            list.map((t) => {
              const table = t.rounds.length ? standings(db, t) : [];
              const top = table[0];
              const progress = Math.round((t.rounds.length / t.plannedRounds) * 100);
              return (
                <Link key={t.id} href={`/tournaments/${t.id}`} className="card hover:border-muted/60 transition-colors flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-base truncate">{t.name}</div>
                      <div className="text-xs text-muted mt-0.5">
                        {formatDate(t.date)} · {t.participantIds.length} players · {MODES.find((m) => m.value === t.pairingMode)?.label}
                        {t.timeControl && ` · ${t.timeControl}`}
                        {!t.rated && " · unrated"}
                      </div>
                    </div>
                    <StatusBadge status={t.status} />
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-1.5 rounded-full bg-panel-2 overflow-hidden">
                      <div className={`h-full rounded-full ${t.status === "finished" ? "bg-win" : "bg-accent"}`} style={{ width: `${progress}%` }} />
                    </div>
                    <span className="text-xs text-muted font-mono whitespace-nowrap">
                      R {t.rounds.length}/{t.plannedRounds}
                    </span>
                  </div>
                  {top && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted text-xs uppercase tracking-wider">{t.status === "finished" ? "Winner" : "Leading"}</span>
                      <Avatar id={top.playerId} name={top.name} size="xs" />
                      <span className="font-medium">{top.name}</span>
                      <span className="font-mono text-accent">{top.points}</span>
                    </div>
                  )}
                </Link>
              );
            })
          )}
        </div>

        <Section title="New tournament">
          <form action={createTournament} className="flex flex-col gap-4">
            <div>
              <label className="label">Name</label>
              <input name="name" required className="w-full" placeholder="e.g. Autumn Blitz 2026" autoComplete="off" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="label">Date</label>
                <input name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className="w-full" />
              </div>
              <div>
                <label className="label">Rounds</label>
                <input name="plannedRounds" type="number" min={1} max={30} defaultValue={suggestedRounds} className="w-full" />
              </div>
              <div>
                <label className="label">Time control</label>
                <input name="timeControl" className="w-full" placeholder="5+3" list="tc" />
                <datalist id="tc">
                  <option value="3+2" />
                  <option value="5+0" />
                  <option value="5+3" />
                  <option value="10+0" />
                  <option value="10+5" />
                  <option value="15+10" />
                </datalist>
              </div>
            </div>
            <div>
              <label className="label">Format</label>
              <div className="grid grid-cols-1 gap-2">
                {MODES.map((m, i) => (
                  <label key={m.value} className="chip items-start">
                    <input type="radio" name="pairingMode" value={m.value} defaultChecked={i === 0} className="mt-0.5" />
                    <span>
                      <span className="font-medium">{m.label}</span>
                      <span className="block text-[11px] text-muted">{m.help}</span>
                    </span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted mt-1.5">Round robin and knockout set the round count themselves.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Knockout: games per match</label>
                <select name="gamesPerMatch" className="w-full" defaultValue="1">
                  <option value="1">1 game (tiebreak on draw)</option>
                  <option value="2">2 games, colors swapped</option>
                </select>
              </div>
              <label className="chip self-end">
                <input type="checkbox" name="thirdPlace" defaultChecked /> <span>Knockout: play a 3rd-place match</span>
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Tiebreaks</label>
                <select name="tiebreaks" className="w-full" defaultValue="club">
                  {TIEBREAK_PRESETS.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Bye scores</label>
                <select name="byePoints" className="w-full" defaultValue={String(db.settings.byePoints)}>
                  <option value="1">1 point</option>
                  <option value="0.5">½ point</option>
                </select>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="rated" value="on" defaultChecked /> Rated (games change Elo)
            </label>
            <input type="hidden" name="rated" value="off" />
            <div>
              <label className="label">Participants</label>
              {players.length === 0 ? (
                <p className="text-sm text-muted">No active players yet.</p>
              ) : (
                <div className="grid grid-cols-2 gap-1.5 max-h-64 overflow-y-auto pr-1">
                  {players.map((p) => (
                    <label key={p.id} className="chip">
                      <input type="checkbox" name="participantIds" value={p.id} defaultChecked />
                      <span className="truncate">{p.name}</span>
                      <span className="ml-auto text-muted font-mono text-xs">{p.rating}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <SubmitButton pendingText="Creating…">Create tournament</SubmitButton>
          </form>
        </Section>
      </div>
    </>
  );
}
