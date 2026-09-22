"use client";

import { useActionState, useEffect } from "react";
import { createChallenge, type ChallengeFormState } from "@/lib/actions";
import { cleanTimeControl, type ChallengeOpponent } from "@/lib/challenges";
import { Icon } from "./icons";
import { NowButton } from "./NowButton";
import { OpponentPicker } from "./OpponentPicker";
import { SubmitButton } from "./SubmitButton";
import { useT } from "./I18nProvider";
import { useToast } from "./Toast";

/**
 * Form to challenge someone. `toId` fixes the opponent (profile page); `fromId` lets the admin act for a player.
 * Runs through useActionState so a refused challenge hands the typed values back: the form only clears once a
 * challenge was actually created.
 */
export function ChallengeForm({ players, me, admin, toId, today }: { players: ChallengeOpponent[]; me: string | null; admin: boolean; toId?: string; today: string }) {
  const { t } = useT();
  const m = t.challenges;
  const toast = useToast();
  const [state, action] = useActionState(createChallenge, {} as ChallengeFormState);
  const v = state.values ?? {};
  const others = players.filter((p) => p.id !== me);

  useEffect(() => {
    if (state.error) toast.push({ text: state.error, tone: "error" });
    else if (state.ok) toast.push({ text: m.sentOk, tone: "ok" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    // Remount on every outcome: defaults are the kept values after an error, and empty again after success.
    <form key={state.ok ?? state.error ?? "fresh"} action={action} className="flex flex-col gap-3 text-sm">
      {admin && !me && (
        <div>
          <label className="label">{t.common.player}</label>
          <select name="fromId" required className="w-full" defaultValue={v.fromId}>
            {players.filter((p) => p.id !== toId).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {toId ? (
        <input type="hidden" name="toId" value={toId} />
      ) : (
        <div>
          <label className="label">{m.opponent}</label>
          <OpponentPicker players={others} defaultValue={v.toId} />
        </div>
      )}
      <div>
        <div className="flex items-end justify-between gap-2">
          <label className="label">{m.when}</label>
          <NowButton label={m.now} title={m.nowHint} className="btn btn-sm btn-ghost -mb-1 text-xs text-muted hover:text-accent" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <input name="date" type="date" required defaultValue={v.date ?? today} className="w-full" aria-label={m.date} />
          <input name="time" type="time" required defaultValue={v.time ?? "18:00"} className="w-full" aria-label={m.time} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">{m.place}</label>
          <input name="place" required maxLength={80} defaultValue={v.place ?? ""} placeholder={m.placePlaceholder} className="w-full" />
        </div>
        <div>
          <label className="label">{m.timeControl}</label>
          <input
            name="timeControl"
            required
            inputMode="numeric"
            pattern="\d+(\+\d+)?"
            title={m.timeControlHint}
            maxLength={20}
            defaultValue={v.timeControl ?? ""}
            placeholder="15+10"
            list="tc-challenge"
            className="w-full font-mono"
            onInput={(e) => {
              const el = e.currentTarget;
              const clean = cleanTimeControl(el.value);
              if (clean !== el.value) el.value = clean;
            }}
          />
          <datalist id="tc-challenge">
            <option value="5+3" />
            <option value="10+0" />
            <option value="15+10" />
            <option value="25+10" />
          </datalist>
        </div>
      </div>
      <div>
        <label className="label">{m.ratedLabel}</label>
        <div className="grid grid-cols-2 gap-2">
          {[
            ["on", m.ratedOn],
            ["off", m.ratedOff],
          ].map(([val, l]) => (
            <label key={val} className="chip justify-center text-xs">
              <input type="radio" name="rated" value={val} defaultChecked={(v.rated ?? "on") === val} className="sr-only" />
              {l}
            </label>
          ))}
        </div>
      </div>
      <div>
        <label className="label">{m.note}</label>
        <input name="note" maxLength={200} defaultValue={v.note ?? ""} placeholder={m.notePlaceholder} className="w-full" />
      </div>
      <SubmitButton className="btn btn-primary self-start" pendingText={m.sending}>
        <Icon name="swords" className="h-4 w-4" /> {m.send}
      </SubmitButton>
    </form>
  );
}
