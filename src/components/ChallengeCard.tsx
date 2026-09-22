import Link from "next/link";
import { answerChallenge, cancelChallenge, createChallenge, proposeChallengeTime, recordChallengeResult } from "@/lib/actions";
import { effectiveStatus, googleCalendarUrl, isToday, playedSummary, SETTLED_QUIET } from "@/lib/challenges";
import { fmt, type Dict, type Lang } from "@/lib/i18n";
import { formatDateTime, resultLabel } from "@/lib/queries";
import { localDay, localTime } from "@/lib/time";
import type { Challenge, Game, Player } from "@/lib/types";
import { ConfirmButton } from "./ConfirmButton";
import { ResultButtons } from "./ResultButtons";
import { NowButton } from "./NowButton";
import { Icon } from "./icons";
import { SubmitButton } from "./SubmitButton";
import { Avatar, ColorDot, Pill, PlayerLink } from "./ui";

/**
 * One challenge with the controls the viewer is allowed to use: answer when it is their turn,
 * withdraw or suggest another time when they are involved, enter the result once agreed.
 * `me` is the viewing player (null for admin-only or guests); `admin` unlocks everything.
 */
export function ChallengeCard({ c, names, me, admin, t, lang, clubName = "", games }: { c: Challenge; names: Map<string, Player>; me: string | null; admin: boolean; t: Dict; lang: Lang; clubName?: string; games?: Map<string, Game> }) {
  const m = t.challenges;
  const status = effectiveStatus(c);
  const game = status === "played" && c.gameId ? games?.get(c.gameId) ?? null : null;
  const played = game ? playedSummary(game, me) : null;
  const involved = admin || (!!me && (c.fromId === me || c.toId === me));
  const myTurn = status === "pending" && (admin || (!!me && c.proposedBy !== me));
  const from = names.get(c.fromId);
  const to = names.get(c.toId);
  const other = me === c.fromId ? to : me === c.toId ? from : null;
  const tone = played?.outcome ? ({ won: "win", lost: "loss", draw: "muted" } as const)[played.outcome] : status === "accepted" ? "win" : status === "pending" ? "accent" : status === "played" ? "muted" : "loss";
  const label = played?.outcome ? m[played.outcome] : m[status];
  const today = status === "accepted" && isToday(c.at);
  const dateInput = localDay(new Date(c.at));
  const timeInput = localTime(new Date(c.at));

  // Nothing came of it: one quiet line, so the games that were played stand out in the same list.
  if (SETTLED_QUIET.includes(status)) {
    return (
      <li className="flex items-center justify-between gap-3 rounded-xl border border-line/60 px-3 py-2 text-sm text-muted">
        <span className="flex items-center gap-2 min-w-0">
          <Avatar id={c.fromId} name={from?.name ?? "?"} size="sm" />
          <Avatar id={c.toId} name={to?.name ?? "?"} size="sm" />
          <span className="truncate">
            {other ? fmt(m.vs, { name: other.name }) : `${from?.name ?? "?"} – ${to?.name ?? "?"}`}
            <span className="text-xs"> · {formatDateTime(c.at, lang)}</span>
          </span>
        </span>
        <Pill tone="muted">{label}</Pill>
      </li>
    );
  }

  return (
    <li className={`card flex flex-col gap-3 ${today ? "border-accent/50 bg-accent/5" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Avatar id={c.fromId} name={from?.name ?? "?"} size="sm" />
          <Avatar id={c.toId} name={to?.name ?? "?"} size="sm" />
          <div className="min-w-0 text-sm">
            <div className="font-medium truncate">
              {other ? fmt(m.vs, { name: other.name }) : (
                <>
                  <PlayerLink id={c.fromId} name={from?.name ?? "?"} /> – <PlayerLink id={c.toId} name={to?.name ?? "?"} />
                </>
              )}
            </div>
            <div className="text-xs text-muted">
              {formatDateTime(c.at, lang)}
              {today && <span className="ml-2 text-accent font-medium">{m.today}</span>}
              {c.place && ` · ${c.place}`}
              {c.timeControl && <span className="font-mono"> · {c.timeControl}</span>}
            </div>
          </div>
        </div>
        <span className="flex shrink-0 items-center gap-1.5">
          <Pill tone={c.rated ? "accent" : "muted"}>{c.rated ? m.ratedShort : t.common.unrated}</Pill>
          <Pill tone={tone}>{label}</Pill>
        </span>
      </div>
      {game ? (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="flex items-center gap-2">
            <ColorDot color="white" /> {names.get(game.whiteId)?.name ?? "?"}
            <span className="font-mono font-semibold">{resultLabel(game.result)}</span>
            {names.get(game.blackId)?.name ?? "?"} <ColorDot color="black" />
          </span>
          {played?.delta !== null && played?.delta !== undefined && (
            <span className={`font-mono text-xs ${played.delta > 0 ? "text-win" : played.delta < 0 ? "text-loss" : "text-muted"}`} title={m.ratingChange}>
              {played.delta > 0 ? `+${played.delta}` : played.delta}
            </span>
          )}
          {!game.rated && <span className="text-xs text-muted">({t.common.unrated})</span>}
        </p>
      ) : (
        c.whiteId &&
        (status === "accepted" || status === "played") && (
          <p className="flex items-center gap-2 text-xs text-muted">
            <ColorDot color="white" /> {names.get(c.whiteId)?.name}
            <ColorDot color="black" /> {names.get(c.whiteId === c.fromId ? c.toId : c.fromId)?.name}
          </p>
        )
      )}
      {c.note && <p className="text-sm text-muted">{c.note}</p>}
      {status === "pending" && c.proposedBy !== c.fromId && (
        <p className="text-xs text-accent">{fmt(m.counterBy, { name: names.get(c.proposedBy)?.name ?? "?" })}</p>
      )}

      {involved && (status === "pending" || status === "accepted") && (
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-line/60 no-print">
          {myTurn && (
            <>
              <form action={answerChallenge.bind(null, c.id, "accept")}>
                <SubmitButton className="btn btn-primary btn-sm" pendingText="…">
                  {m.accept}
                </SubmitButton>
              </form>
              <form action={answerChallenge.bind(null, c.id, "decline")}>
                <SubmitButton className="btn btn-sm" pendingText="…">
                  {m.decline}
                </SubmitButton>
              </form>
            </>
          )}
          {status === "accepted" && (
            <span className="inline-flex flex-wrap gap-1.5" title={m.calendarHint}>
              <a
                href={googleCalendarUrl(c, { from: from?.name ?? "?", to: to?.name ?? "?", club: clubName }, m.calendarEvent)}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-sm"
              >
                <Icon name="download" className="h-3.5 w-3.5" /> {m.calendarGoogle}
              </a>
              <a href={`/api/challenge/${c.id}`} className="btn btn-sm btn-ghost" download>
                {m.calendar}
              </a>
            </span>
          )}
          <details className="group">
            <summary className="btn btn-sm btn-ghost cursor-pointer list-none">{m.propose}</summary>
            <form action={proposeChallengeTime.bind(null, c.id)} className="mt-2 flex flex-wrap items-end gap-2 rounded-xl border border-line bg-panel-2/40 p-3">
              <div>
                <label className="label">{m.date}</label>
                <input name="date" type="date" defaultValue={dateInput} required />
              </div>
              <div>
                <label className="label">{m.time}</label>
                <input name="time" type="time" defaultValue={timeInput} required />
              </div>
              <div>
                <label className="label">{m.place}</label>
                <input name="place" defaultValue={c.place} placeholder={m.placePlaceholder} className="w-36" />
              </div>
              <SubmitButton className="btn btn-sm" pendingText="…">
                {m.proposeSend}
              </SubmitButton>
            </form>
          </details>
          {status === "accepted" && (
            <details className="group w-full">
              <summary className="btn btn-sm btn-primary cursor-pointer list-none inline-flex">{m.recordResult}</summary>
              <form action={recordChallengeResult.bind(null, c.id)} className="mt-2 flex flex-col gap-3 rounded-xl border border-line bg-panel-2/40 p-3 text-sm">
                <p className="text-xs text-muted">
                  {c.whiteId ? fmt(m.whitePlays, { name: names.get(c.whiteId)?.name ?? "?" }) : m.colorsDrawn}
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    ["1-0", "1–0"],
                    ["1/2-1/2", "½–½"],
                    ["0-1", "0–1"],
                  ].map(([v, l], i) => (
                    <label key={v} className="chip justify-center">
                      <input type="radio" name="result" value={v} defaultChecked={i === 0} className="sr-only" />
                      <span className="font-mono font-medium">{l}</span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted">{c.rated ? m.ratedOn : m.ratedOff}</p>
                <SubmitButton className="btn btn-primary btn-sm self-start" pendingText={t.common.saving}>
                  {m.save}
                </SubmitButton>
              </form>
            </details>
          )}
          <span className="ml-auto">
            <ConfirmButton action={cancelChallenge.bind(null, c.id)} className="btn btn-sm btn-ghost text-muted" confirmLabel={m.cancelConfirm}>
              {m.cancel}
            </ConfirmButton>
          </span>
        </div>
      )}
      {status === "played" && c.gameId && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link href={`/games?kind=friendly${other ? `&q=${encodeURIComponent(other.name)}` : ""}`} className="text-xs text-muted hover:text-accent">
            {m.openGames} →
          </Link>
          {admin && game && (
            <details className="group no-print">
              <summary className="btn btn-sm btn-ghost cursor-pointer list-none text-muted">{m.correctResult}</summary>
              <div className="mt-2 flex flex-col gap-2 rounded-xl border border-line bg-panel-2/40 p-3 text-xs text-muted">
                <span>{fmt(m.correctResultHint, { white: names.get(game.whiteId)?.name ?? "?", black: names.get(game.blackId)?.name ?? "?" })}</span>
                <ResultButtons gameId={game.id} current={game.result} names={{ white: names.get(game.whiteId)?.name ?? "?", black: names.get(game.blackId)?.name ?? "?" }} allowClear={false} />
              </div>
            </details>
          )}
        </div>
      )}
    </li>
  );
}

/** Form to challenge someone. `toId` fixes the opponent (profile page); `fromId` lets the admin act for a player. */
export function ChallengeForm({ players, me, admin, toId, t }: { players: Player[]; me: string | null; admin: boolean; toId?: string; t: Dict }) {
  const m = t.challenges;
  const others = players.filter((p) => p.active && p.id !== me);
  const today = localDay();
  return (
    <form action={createChallenge} className="flex flex-col gap-3 text-sm">
      {admin && !me && (
        <div>
          <label className="label">{t.common.player}</label>
          <select name="fromId" required className="w-full">
            {players.filter((p) => p.active && p.id !== toId).map((p) => (
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
          <select name="toId" required className="w-full" defaultValue="">
            <option value="" disabled>
              —
            </option>
            {others.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.rating})
              </option>
            ))}
          </select>
        </div>
      )}
      <div>
        <div className="flex items-end justify-between gap-2">
          <label className="label">{m.when}</label>
          <NowButton label={m.now} title={m.nowHint} className="btn btn-sm btn-ghost -mb-1 text-xs text-muted hover:text-accent" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <input name="date" type="date" required defaultValue={today} className="w-full" aria-label={m.date} />
          <input name="time" type="time" required defaultValue="18:00" className="w-full" aria-label={m.time} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">{m.place}</label>
          <input name="place" required maxLength={80} placeholder={m.placePlaceholder} className="w-full" />
        </div>
        <div>
          <label className="label">{m.timeControl}</label>
          <input name="timeControl" required maxLength={20} placeholder="15+10" list="tc-challenge" className="w-full" />
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
          ].map(([v, l], i) => (
            <label key={v} className="chip justify-center text-xs">
              <input type="radio" name="rated" value={v} defaultChecked={i === 0} className="sr-only" />
              {l}
            </label>
          ))}
        </div>
      </div>
      <div>
        <label className="label">{m.note}</label>
        <input name="note" maxLength={200} placeholder={m.notePlaceholder} className="w-full" />
      </div>
      <SubmitButton className="btn btn-primary self-start" pendingText={m.sending}>
        <Icon name="swords" className="h-4 w-4" /> {m.send}
      </SubmitButton>
    </form>
  );
}
