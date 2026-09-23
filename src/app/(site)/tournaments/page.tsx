import Link from "next/link";
import { localDay } from "@/lib/time";
import { readDb } from "@/lib/db";
import { isMemberDevice } from "@/lib/auth";
import { GuestNotice } from "@/components/GuestNotice";
import { getT } from "@/lib/lang";
import { fmt, plural } from "@/lib/i18n";
import { createTournament } from "@/lib/actions";
import { formatDate, leaderboard, standings, tiebreakPresets } from "@/lib/queries";
import { SubmitButton } from "@/components/SubmitButton";
import { Avatar, Empty, PageHeader, Section, StatusBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

const MODE_KEYS = ["random", "swiss", "roundrobin", "knockout"] as const;

export default async function TournamentsPage() {
  const { t: msg, lang } = await getT();
  const db = await readDb();
  const member = await isMemberDevice();
  const list = [...db.tournaments].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const players = leaderboard(db);
  const suggestedRounds = Math.max(3, Math.min(7, Math.ceil(Math.log2(Math.max(players.length, 2))) + 1));
  const modes = MODE_KEYS.map((value) => ({ value, ...msg.tournaments.modes[value] }));

  return (
    <>
      <PageHeader eyebrow={msg.tournaments.eyebrow} title={msg.tournaments.title} subtitle={<span>{fmt(msg.tournaments.totalN, { n: list.length })}</span>} />

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="flex flex-col gap-3">
          {list.length === 0 ? (
            <div className="card">
              <Empty icon="rook" title={msg.tournaments.noneYet}>{msg.tournaments.noneYetHint}</Empty>
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
                        {formatDate(t.date, lang)} · {plural(t.participantIds.length, msg.common.playersN)} · {msg.tournaments.modes[t.pairingMode].label}
                        {t.timeControl && ` · ${t.timeControl}`}
                        {!t.rated && ` · ${msg.common.unrated}`}
                      </div>
                    </div>
                    <StatusBadge status={t.status} />
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-1.5 rounded-full bg-panel-2 overflow-hidden">
                      <div className={`h-full rounded-full ${t.status === "finished" ? "bg-win" : "bg-accent"}`} style={{ width: `${progress}%` }} />
                    </div>
                    <span className="text-xs text-muted font-mono whitespace-nowrap">
                      {fmt(msg.tournaments.roundsShort, { n: t.rounds.length, total: t.plannedRounds })}
                    </span>
                  </div>
                  {top && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted text-xs uppercase tracking-wider">{t.status === "finished" ? msg.tournaments.winner : msg.tournaments.leading}</span>
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

        {!member ? (
          <div className="col-stack">
            <GuestNotice />
          </div>
        ) : (
        <Section title={msg.tournaments.newTournament}>
          <form action={createTournament} className="flex flex-col gap-4">
            <div>
              <label htmlFor="f-tournaments-form-name" className="label">{msg.tournaments.form.name}</label>
              <input id="f-tournaments-form-name" name="name" required className="w-full" placeholder={msg.tournaments.form.namePlaceholder} autoComplete="off" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label htmlFor="f-tournaments-form-date" className="label">{msg.tournaments.form.date}</label>
                <input id="f-tournaments-form-date" name="date" type="date" defaultValue={localDay()} className="w-full" />
              </div>
              <div className={`transition-opacity [form:has(input[name=pairingMode][value=roundrobin]:checked)_&]:opacity-50 [form:has(input[name=pairingMode][value=knockout]:checked)_&]:opacity-50`} title={msg.tournaments.form.roundsAuto}>
                <label htmlFor="f-tournaments-form-rounds" className="label">{msg.tournaments.form.rounds}</label>
                <input id="f-tournaments-form-rounds" name="plannedRounds" type="number" min={1} max={30} defaultValue={suggestedRounds} className="w-full" />
              </div>
              <div>
                <label htmlFor="f-tournaments-form-timeControl" className="label">{msg.tournaments.form.timeControl}</label>
                <input id="f-tournaments-form-timeControl" name="timeControl" className="w-full" placeholder="5+3" list="tc" />
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
              <label className="label">{msg.tournaments.form.format}</label>
              <div className="grid grid-cols-1 gap-2">
                {modes.map((m, i) => (
                  <label key={m.value} className="chip items-start">
                    <input type="radio" name="pairingMode" value={m.value} defaultChecked={i === 0} className="mt-0.5" />
                    <span>
                      <span className="font-medium">{m.label}</span>
                      <span className="block text-[11px] text-muted">{m.help}</span>
                    </span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted mt-1.5">{msg.tournaments.form.formatHint}</p>
            </div>
            {/* Only meaningful for a knockout; shown by CSS as soon as that radio is picked, no client JS needed. */}
            <fieldset className={`hidden [form:has(input[name=pairingMode][value=knockout]:checked)_&]:flex flex-col gap-3 rounded-xl border border-accent/30 bg-accent/5 px-4 py-3`}>
              <legend className="label px-1">{msg.tournaments.form.knockoutOptions}</legend>
              <div>
                <label htmlFor="f-tournaments-form-gamesPerMatchShort" className="label">{msg.tournaments.form.gamesPerMatchShort}</label>
                <select id="f-tournaments-form-gamesPerMatchShort" name="gamesPerMatch" className="w-full" defaultValue="1">
                  <option value="1">{msg.tournaments.form.oneGameTiebreak}</option>
                  <option value="2">{msg.tournaments.form.twoGamesSwapped}</option>
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="thirdPlace" defaultChecked /> <span>{msg.tournaments.form.thirdPlaceShort}</span>
              </label>
            </fieldset>
            <div className={`grid grid-cols-1 gap-3 [form:has(input[name=pairingMode][value=knockout]:checked)_&]:hidden`}>
              <div>
                <label htmlFor="f-tournaments-form-tiebreaks" className="label">{msg.tournaments.form.tiebreaks}</label>
                <select id="f-tournaments-form-tiebreaks" name="tiebreaks" className="w-full" defaultValue="club">
                  {tiebreakPresets(msg.tournaments.tiebreakPresets).map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="f-tournaments-form-byeScores" className="label">{msg.tournaments.form.byeScores}</label>
                <select id="f-tournaments-form-byeScores" name="byePoints" className="w-full" defaultValue={String(db.settings.byePoints)}>
                  <option value="1">{msg.tournaments.form.onePoint}</option>
                  <option value="0.5">{msg.tournaments.form.halfPoint}</option>
                </select>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="rated" value="on" defaultChecked /> {msg.tournaments.form.ratedElo}
            </label>
            <input type="hidden" name="rated" value="off" />
            <div>
              <label className="label">{msg.tournaments.form.participants}</label>
              {players.length === 0 ? (
                <p className="text-sm text-muted">{msg.tournaments.form.noActivePlayers}</p>
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
            <SubmitButton pendingText={msg.tournaments.form.creating}>{msg.tournaments.form.create}</SubmitButton>
          </form>
        </Section>
        )}
      </div>
    </>
  );
}
