import Link from "next/link";
import { addSessionGame, answerChallenge, cancelChallenge, finishSession, proposeChallengeTime, recordChallengeResult } from "@/lib/actions";
import { challengeGameIds, effectiveStatus, gameBySession, googleCalendarUrl, nextSessionColors, playedSummary, recordable, sessionScore, SETTLED_QUIET } from "@/lib/challenges";
import { fmt, type Dict, type Lang } from "@/lib/i18n";
import { formatDateTime } from "@/lib/queries";
import { nameOf, resultLabel, scoreText } from "@/lib/score";
import { localDay, localTime, sameLocalDay } from "@/lib/time";
import type { Challenge, Game, GameResult, Player } from "@/lib/types";
import { ConfirmButton } from "./ConfirmButton";
import { ResultButtons } from "./ResultButtons";
import { Icon } from "./icons";
import { SubmitButton } from "./SubmitButton";
import { Avatar, ColorDot, Pill, PlayerLink } from "./ui";

/** The three results a challenge can end with, and the word that names each. */
const RESULT_CHOICES: [GameResult, "whiteWins" | "draw" | "blackWins"][] = [
  ["1-0", "whiteWins"],
  ["1/2-1/2", "draw"],
  ["0-1", "blackWins"],
];

/**
 * One challenge with the controls the viewer is allowed to use: answer when it is their turn,
 * withdraw or suggest another time when they are involved, enter the result once agreed.
 * `me` is the viewing player (null for admin-only or guests); `admin` unlocks everything.
 */
export function ChallengeCard({ c, names, me, admin, t, lang, clubName = "", games }: { c: Challenge; names: Map<string, Player>; me: string | null; admin: boolean; t: Dict; lang: Lang; clubName?: string; games?: Map<string, Game> }) {
  const m = t.challenges;
  const status = effectiveStatus(c);
  const each = gameBySession(c);
  const game = status === "played" && c.gameId && !each ? games?.get(c.gameId) ?? null : null;
  const sessionGames = each ? challengeGameIds(c).flatMap((id) => games?.get(id) ?? []) : [];
  const score = each ? sessionScore(c, new Map(sessionGames.map((g) => [g.id, g]))) : null;
  // A finished session reads like one game from the viewer's seat: won, lost or drawn on points.
  const sessionOutcome =
    each && status === "played" && score && (me === c.fromId || me === c.toId)
      ? ((mine: number, theirs: number): "won" | "lost" | "draw" => (mine > theirs ? "won" : mine < theirs ? "lost" : "draw"))(me === c.fromId ? score.from : score.to, me === c.fromId ? score.to : score.from)
      : null;
  const played = game ? playedSummary(game, me) : sessionOutcome ? { outcome: sessionOutcome, delta: null } : null;
  const involved = admin || (!!me && (c.fromId === me || c.toId === me));
  const myTurn = status === "pending" && (admin || (!!me && c.proposedBy !== me));
  const from = names.get(c.fromId);
  const to = names.get(c.toId);
  const fromName = nameOf(names, c.fromId);
  const toName = nameOf(names, c.toId);
  const other = me === c.fromId ? to : me === c.toId ? from : null;
  const tone = played?.outcome ? ({ won: "win", lost: "loss", draw: "muted" } as const)[played.outcome] : status === "accepted" ? "win" : status === "pending" ? "accent" : status === "played" ? "muted" : "loss";
  const label = played?.outcome ? m[played.outcome] : m[status];
  const today = status === "accepted" && sameLocalDay(c.at);
  const dateInput = localDay(new Date(c.at));
  const timeInput = localTime(new Date(c.at));

  const resultChips = (
    <fieldset className="grid grid-cols-3 gap-2">
      <legend className="sr-only">{t.common.result}</legend>
      {RESULT_CHOICES.map(([v, word]) => (
        <label key={v} className="chip justify-center" title={t.pairing[word]}>
          <input type="radio" name="result" value={v} required className="sr-only" aria-label={t.pairing[word]} />
          <span className="font-mono font-medium" aria-hidden>
            {resultLabel(v)}
          </span>
        </label>
      ))}
    </fieldset>
  );

  // Every game of an `each` session in order, with the running score; while it is open, the next game and "finish".
  const sessionPanel = each && (
    <div className="flex flex-col gap-2 w-full">
      <div className="flex items-center justify-between gap-2 text-xs text-muted">
        <span className="label mb-0">{m.sessionGames}</span>
        {score && score.games > 0 && (
          <span className="font-mono text-sm text-fg">
            {fmt(m.sessionScoreLine, { from: fromName, a: scoreText(score.from), b: scoreText(score.to), to: toName })}
          </span>
        )}
      </div>
      {sessionGames.length === 0 ? (
        <p className="text-xs text-muted">{m.sessionNoGamesYet}</p>
      ) : (
        <ol className="flex flex-col divide-y divide-line/60 rounded-lg border border-line/60 text-sm">
          {sessionGames.map((g, i) => (
            <li key={g.id} className="flex items-center gap-2 px-3 py-1.5">
              <span className="w-16 shrink-0 text-xs text-muted">{fmt(m.sessionGameN, { n: i + 1 })}</span>
              <ColorDot color="white" /> <span className="truncate">{nameOf(names, g.whiteId)}</span>
              <span className="font-mono font-semibold">{resultLabel(g.result)}</span>
              <span className="truncate">{nameOf(names, g.blackId)}</span> <ColorDot color="black" />
            </li>
          ))}
        </ol>
      )}
      {involved && recordable(c) && (
        <div className="flex flex-wrap items-start gap-2">
          <details className="group">
            <summary className="btn btn-sm btn-primary cursor-pointer list-none inline-flex">{m.addGame}</summary>
            <form action={addSessionGame.bind(null, c.id)} className="mt-2 flex flex-col gap-3 rounded-xl border border-line bg-panel-2/40 p-3 text-sm">
              <p className="text-xs text-muted">{fmt(m.sessionNextColors, { name: nameOf(names, nextSessionColors(c).whiteId) })}</p>
              {resultChips}
              <SubmitButton className="btn btn-primary btn-sm self-start" pendingText={t.common.saving}>
                {m.save}
              </SubmitButton>
            </form>
          </details>
          {sessionGames.length > 0 && (
            <ConfirmButton action={finishSession.bind(null, c.id)} className="btn btn-sm" confirmLabel={m.finishConfirm}>
              {m.finishSession}
            </ConfirmButton>
          )}
        </div>
      )}
    </div>
  );

  const recordForm = each ? sessionPanel : (
    <details className="group w-full">
      <summary className="btn btn-sm btn-primary cursor-pointer list-none inline-flex">{m.recordResult}</summary>
      <form action={recordChallengeResult.bind(null, c.id)} className="mt-2 flex flex-col gap-3 rounded-xl border border-line bg-panel-2/40 p-3 text-sm">
        <p className="text-xs text-muted">
          {c.session ? m.sessionSingleHint : c.whiteId ? fmt(m.whitePlays, { name: nameOf(names, c.whiteId) }) : m.colorsDrawn}
        </p>
        {resultChips}
        <p className="text-xs text-muted">{c.rated ? m.ratedOn : m.ratedOff}</p>
        <SubmitButton className="btn btn-primary btn-sm self-start" pendingText={t.common.saving}>
          {m.save}
        </SubmitButton>
      </form>
    </details>
  );

  // Nothing came of it: one quiet line, so the games that were played stand out in the same list.
  // An agreed game past its day that nobody entered keeps the result form, so it can still be recorded.
  if (SETTLED_QUIET.includes(status)) {
    const late = involved && recordable(c);
    return (
      <li className="flex flex-col gap-2 rounded-xl border border-line/60 px-3 py-2 text-sm text-muted">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 min-w-0">
            <Avatar id={c.fromId} name={fromName} size="sm" />
            <Avatar id={c.toId} name={toName} size="sm" />
            <span className="truncate">
              {other ? fmt(m.vs, { name: other.name }) : `${fromName} – ${toName}`}
              <span className="text-xs"> · {formatDateTime(c.at, lang)}</span>
            </span>
          </span>
          <Pill tone="muted">{label}</Pill>
        </div>
        {late && recordForm}
      </li>
    );
  }

  return (
    <li className={`card flex flex-col gap-3 ${today ? "border-accent/50 bg-accent/5" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Avatar id={c.fromId} name={fromName} size="sm" />
          <Avatar id={c.toId} name={toName} size="sm" />
          <div className="min-w-0 text-sm">
            <div className="font-medium truncate">
              {other ? fmt(m.vs, { name: other.name }) : (
                <>
                  <PlayerLink id={c.fromId} name={fromName} /> – <PlayerLink id={c.toId} name={toName} />
                </>
              )}
            </div>
            <div className="text-xs text-muted">
              {formatDateTime(c.at, lang)}
              {today && <span className="ml-2 text-accent font-medium">{m.today}</span>}
              {c.place && ` · ${c.place}`}
              {c.timeControl && !c.session && <span className="font-mono"> · {c.timeControl}</span>}
              {c.session && ` · ${fmt(m.sessionPill, { duration: m.durations[String(c.session.minutes) as keyof typeof m.durations] ?? `${c.session.minutes}` })}`}
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
            <ColorDot color="white" /> {nameOf(names, game.whiteId)}
            <span className="font-mono font-semibold">{resultLabel(game.result)}</span>
            {nameOf(names, game.blackId)} <ColorDot color="black" />
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
            <ColorDot color="white" /> {nameOf(names, c.whiteId)}
            <ColorDot color="black" /> {nameOf(names, c.whiteId === c.fromId ? c.toId : c.fromId)}
          </p>
        )
      )}
      {each && status === "played" && sessionPanel}
      {c.note && <p className="text-sm text-muted">{c.note}</p>}
      {status === "pending" && c.proposedBy !== c.fromId && (
        <p className="text-xs text-accent">{fmt(m.counterBy, { name: nameOf(names, c.proposedBy) })}</p>
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
                href={googleCalendarUrl(c, { from: fromName, to: toName, club: clubName }, m.calendarEvent)}
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
                <label htmlFor={`f-date-${c.id}`} className="label">{m.date}</label>
                <input id={`f-date-${c.id}`} name="date" type="date" defaultValue={dateInput} required />
              </div>
              <div>
                <label htmlFor={`f-time-${c.id}`} className="label">{m.time}</label>
                <input id={`f-time-${c.id}`} name="time" type="time" defaultValue={timeInput} required />
              </div>
              <div>
                <label htmlFor={`f-place-${c.id}`} className="label">{m.place}</label>
                <input id={`f-place-${c.id}`} name="place" defaultValue={c.place} placeholder={m.placePlaceholder} className="w-36" />
              </div>
              <SubmitButton className="btn btn-sm" pendingText="…">
                {m.proposeSend}
              </SubmitButton>
            </form>
          </details>
          {status === "accepted" && recordForm}
          <span className="ml-auto">
            <ConfirmButton action={cancelChallenge.bind(null, c.id)} className="btn btn-sm btn-ghost text-muted" confirmLabel={m.cancelConfirm}>
              {m.cancel}
            </ConfirmButton>
          </span>
        </div>
      )}
      {status === "played" && (c.gameId || each) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link href={`/games?kind=friendly${other ? `&q=${encodeURIComponent(other.name)}` : ""}`} className="inline-flex items-center gap-1 text-xs text-muted hover:text-accent">
            {m.openGames}
            <Icon name="arrow-right" className="h-3.5 w-3.5" />
          </Link>
          {admin && game && (
            <details className="group no-print">
              <summary className="btn btn-sm btn-ghost cursor-pointer list-none text-muted">{m.correctResult}</summary>
              <div className="mt-2 flex flex-col gap-2 rounded-xl border border-line bg-panel-2/40 p-3 text-xs text-muted">
                <span>{fmt(m.correctResultHint, { white: nameOf(names, game.whiteId), black: nameOf(names, game.blackId) })}</span>
                <ResultButtons gameId={game.id} current={game.result} names={{ white: nameOf(names, game.whiteId), black: nameOf(names, game.blackId) }} allowClear={false} />
              </div>
            </details>
          )}
        </div>
      )}
    </li>
  );
}
