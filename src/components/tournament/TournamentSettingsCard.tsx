import { ConfirmButton } from "@/components/ConfirmButton";
import { Icon } from "@/components/icons";
import { SubmitButton } from "@/components/SubmitButton";
import { Section } from "@/components/ui";
import { deleteTournament, updateTournament } from "@/lib/actions";
import type { Dict } from "@/lib/i18n";
import { tiebreakPresets } from "@/lib/queries";
import type { TournamentView } from "./view";

/** Shown only while the format select says knockout; pure CSS, so the fields still submit (and are ignored) otherwise. */
const KNOCKOUT_ONLY = "hidden [form:has(select[name=pairingMode]_option[value=knockout]:checked)_&]:grid";

/** Admin only: edit the tournament, and (folded away at the bottom) delete it. */
export function TournamentSettingsCard({ view, msg }: { view: TournamentView; msg: Dict }) {
  const { t, isRR, isKO } = view;
  const f = msg.tournaments.form;
  const tiebreakPreset = tiebreakPresets().find((p) => p.order.join() === t.tiebreaks.join())?.key ?? "club";

  return (
    <Section title={msg.tournaments.settings}>
      <form action={updateTournament.bind(null, t.id)} className="flex flex-col gap-3">
        <div>
          <label htmlFor="f-tournaments-form-name" className="label">
            {f.name}
          </label>
          <input id="f-tournaments-form-name" name="name" defaultValue={t.name} className="w-full" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <label htmlFor="f-tournaments-form-date" className="label">
              {f.date}
            </label>
            <input id="f-tournaments-form-date" name="date" type="date" defaultValue={t.date} className="w-full" />
          </div>
          <div title={isRR || isKO ? f.roundsAuto : undefined}>
            <label htmlFor="f-tournaments-form-rounds" className="label">
              {f.rounds}
            </label>
            <input
              id="f-tournaments-form-rounds"
              name="plannedRounds"
              type="number"
              min={Math.max(1, t.rounds.length)}
              max={30}
              defaultValue={t.plannedRounds}
              className="w-full"
              disabled={isRR || isKO}
            />
          </div>
          <div>
            <label htmlFor="f-tournaments-form-timeControl" className="label">
              {f.timeControl}
            </label>
            <input
              id="f-tournaments-form-timeControl"
              name="timeControl"
              defaultValue={t.timeControl}
              className="w-full"
              placeholder="5+3"
            />
          </div>
        </div>
        <div>
          <label htmlFor="f-tournaments-form-tiebreaks" className="label">
            {f.tiebreaks}
          </label>
          <select id="f-tournaments-form-tiebreaks" name="tiebreaks" className="w-full" defaultValue={tiebreakPreset}>
            {tiebreakPresets(msg.tournaments.tiebreakPresets).map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        {t.status === "planned" && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="f-tournaments-form-format" className="label">
                  {f.format}
                </label>
                <select id="f-tournaments-form-format" name="pairingMode" defaultValue={t.pairingMode} className="w-full">
                  <option value="random">{msg.tournaments.modes.random.label}</option>
                  <option value="swiss">{msg.tournaments.modes.swiss.label}</option>
                  <option value="roundrobin">{msg.tournaments.modes.roundrobin.label}</option>
                  <option value="knockout">{msg.tournaments.modes.knockout.label}</option>
                </select>
              </div>
              <div>
                <label htmlFor="f-tournaments-form-byeScores" className="label">
                  {f.byeScores}
                </label>
                <select
                  id="f-tournaments-form-byeScores"
                  name="byePoints"
                  defaultValue={String(t.byePoints)}
                  className="w-full"
                >
                  <option value="1">{f.onePoint}</option>
                  <option value="0.5">{f.halfPoint}</option>
                </select>
              </div>
            </div>
            <div className={`${KNOCKOUT_ONLY} grid-cols-1 sm:grid-cols-2 gap-3`}>
              <div>
                <label htmlFor="f-tournaments-form-gamesPerMatch" className="label">
                  {f.gamesPerMatch}
                </label>
                <select
                  id="f-tournaments-form-gamesPerMatch"
                  name="gamesPerMatch"
                  defaultValue={String(t.knockout?.gamesPerMatch ?? 1)}
                  className="w-full"
                >
                  <option value="1">{f.oneGame}</option>
                  <option value="2">{f.twoGames}</option>
                </select>
              </div>
              <label className="chip self-end">
                <input type="checkbox" name="thirdPlace" defaultChecked={t.knockout?.thirdPlace ?? true} />{" "}
                <span>{f.thirdPlace}</span>
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="rated" defaultChecked={t.rated} /> {f.rated}
            </label>
          </>
        )}
        <SubmitButton className="btn" pendingText={msg.common.saving}>
          {f.saveSettings}
        </SubmitButton>
      </form>

      <details className="group mt-5 pt-4 border-t border-line no-print">
        <summary className="flex items-center justify-between gap-3 cursor-pointer list-none text-sm text-loss">
          {msg.tournaments.dangerZone}
          <Icon name="chevron" className="h-4 w-4 transition-transform group-open:rotate-180" />
        </summary>
        <p className="text-xs text-muted mt-3 mb-3">{msg.tournaments.dangerHint}</p>
        <ConfirmButton action={deleteTournament.bind(null, t.id)} confirmLabel={msg.tournaments.deleteTournament}>
          {msg.tournaments.deleteTournament}
        </ConfirmButton>
      </details>
    </Section>
  );
}
