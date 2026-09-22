import { recordFriendlyGame } from "@/lib/actions";
import { getT } from "@/lib/lang";
import { localDay } from "@/lib/time";
import type { Player } from "@/lib/types";
import { SubmitButton } from "./SubmitButton";

/**
 * Admin-only: a friendly game that was played without a challenge, or forgotten and entered days later. Members
 * arrange their games through Challenges, where the result is recorded at the end; this is the back door for
 * the club's bookkeeping.
 */
export async function RecordPastGame({ players }: { players: Player[] }) {
  const { t } = await getT();
  const m = t.games.past;
  const active = players.filter((p) => p.active).sort((a, b) => a.name.localeCompare(b.name));
  const today = localDay();
  if (active.length < 2) return <p className="text-sm text-muted">{m.needTwo}</p>;
  return (
    <form action={recordFriendlyGame} className="flex flex-col gap-3">
      <p className="text-xs text-muted -mt-1">{m.hint}</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">⚪ {t.common.white}</label>
          <select name="whiteId" required className="w-full">
            {active.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.rating})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">⚫ {t.common.black}</label>
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
        <label className="label">{t.common.result}</label>
        <div className="grid grid-cols-3 gap-2">
          {[
            ["1-0", "1–0", m.whiteWins],
            ["1/2-1/2", "½–½", m.draw],
            ["0-1", "0–1", m.blackWins],
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
          <label className="label" htmlFor="past-game-date">
            {m.playedOn}
          </label>
          <input id="past-game-date" name="date" type="date" defaultValue={today} max={today} className="w-full" />
        </div>
        <label className="flex items-center gap-2 text-sm pb-2">
          <input type="checkbox" name="rated" value="on" defaultChecked /> {m.rated}
        </label>
      </div>
      <input type="hidden" name="rated" value="off" />
      <p className="text-xs text-muted -mt-1">{m.backdated}</p>
      <SubmitButton pendingText={t.common.saving}>{m.save}</SubmitButton>
    </form>
  );
}
