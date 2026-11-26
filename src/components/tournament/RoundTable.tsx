import { Fragment } from "react";
import { Icon } from "@/components/icons";
import { ResultButtons } from "@/components/ResultButtons";
import { SubmitButton } from "@/components/SubmitButton";
import { ColorDot, PlayerLink, RatingDelta } from "@/components/ui";
import { setGameSchedule } from "@/lib/actions";
import { eventGoogleUrl } from "@/lib/challenges";
import { fmt, type Dict, type Lang } from "@/lib/i18n";
import { formatDateTime } from "@/lib/queries";
import { gameCalendarEvent } from "@/lib/schedule";
import { nameOf, resultLabel } from "@/lib/score";
import { dayOf, localDay, localTime, sameLocalDay } from "@/lib/time";
import type { Game, Player, Round, Tournament } from "@/lib/types";

type Side = "white" | "black";

/** One round's boards: cards on phones, a four-column table from `md` up. */
export function RoundTable({
  round,
  games,
  names,
  finished,
  ko,
  me = null,
  admin = false,
  msg,
  t,
  roundTitle,
  club,
  lang,
}: {
  /** The tournament, its round title ("Round 3" / "Semifinals") and the club name: for the boards' own dates and their calendar entry. */
  t: Tournament;
  roundTitle: string;
  club: string;
  lang: Lang;
  round: Round;
  games: Map<string, Game>;
  names: Map<string, Player>;
  finished: boolean;
  ko?: Tournament["knockout"];
  /** The device's claimed player: their board is highlighted and only they (or the admin) may enter its result. */
  me?: string | null;
  admin?: boolean;
  msg: Dict;
}) {
  // "3rd place · tiebreak 1" for knockout games that are not simply game 1 of a match.
  const gameLabel = (gameId: string) => {
    if (!ko) return null;
    const m = ko.matches.find((x) => x.gameIds.includes(gameId));
    if (!m) return null;
    const idx = m.gameIds.indexOf(gameId);
    const parts: string[] = [];
    if (m.thirdPlace) parts.push(msg.tournaments.game.thirdPlace);
    if (idx >= ko.gamesPerMatch) parts.push(fmt(msg.tournaments.game.tiebreakN, { n: idx - ko.gamesPerMatch + 1 }));
    else if (ko.gamesPerMatch > 1) parts.push(fmt(msg.tournaments.game.gameN, { n: idx + 1 }));
    return parts.length ? parts.join(" · ") : null;
  };

  const rows = round.pairings.map((p) => {
    const g = games.get(p.gameId);
    const res = g?.result ?? null;
    return {
      p,
      g,
      res,
      whiteWon: res === "1-0" || res === "+/-",
      blackWon: res === "0-1" || res === "-/+",
      wn: nameOf(names, p.whiteId),
      bn: nameOf(names, p.blackId),
      mine: !!me && (p.whiteId === me || p.blackId === me),
      label: gameLabel(p.gameId),
    };
  });
  type Row = (typeof rows)[number];

  const result = (r: Row) => {
    if (!r.g) return <span className="text-loss text-xs">{msg.tournaments.game.missing}</span>;
    if (finished) return <span className="font-mono">{resultLabel(r.g.result)}</span>;
    if (admin || r.mine) {
      return <ResultButtons gameId={r.g.id} current={r.g.result} names={{ white: r.wn, black: r.bn }} allowSwap />;
    }
    return (
      <span className="font-mono" title={msg.common.onlyOwnBoard}>
        {resultLabel(r.g.result)}
      </span>
    );
  };

  /**
   * The board's own date for rounds that spread over weeks: shown to everyone once set, editable by the two players
   * and the admin while the game is unplayed. Null when there is nothing to show, so a one-evening tournament looks as before.
   */
  const schedule = (r: Row) => {
    const g = r.g;
    if (!g || g.result || finished || !r.p.board) return null;
    const canEdit = admin || r.mine;
    const when = g.scheduledAt ?? null;
    if (!when && !canEdit) return null;
    const m = msg.tournaments.schedule;
    const c = msg.challenges;
    const event = canEdit
      ? gameCalendarEvent(g, { white: r.wn, black: r.bn, club, where: fmt(m.where, { tournament: t.name, round: roundTitle }), timeControl: t.timeControl }, c.calendarEvent)
      : null;
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted">
        {when && (
          <span className="inline-flex items-center gap-1.5 text-fg">
            <Icon name="clock" className="h-3.5 w-3.5 text-accent" />
            {formatDateTime(when, lang)}
            {g.place && <span className="text-muted">· {g.place}</span>}
            {sameLocalDay(when) && <span className="text-accent font-medium">{msg.common.today}</span>}
          </span>
        )}
        {event && (
          <span className="inline-flex items-center gap-3 no-print" title={c.calendarHint}>
            <a href={eventGoogleUrl(event)} target="_blank" rel="noopener noreferrer" className="hover:text-accent underline underline-offset-2">
              {c.calendarGoogle}
            </a>
            <a href={`/api/game/${g.id}`} className="hover:text-accent underline underline-offset-2" download>
              {c.calendar}
            </a>
          </span>
        )}
        {canEdit && (
          // Keyed on the stored value: a saved change remounts the form closed, while the page's auto-refresh leaves an open one alone.
          <details key={`${when}|${g.place ?? ""}`} className="group no-print open:basis-full">
            <summary className="cursor-pointer list-none inline-flex items-center gap-1.5 hover:text-accent">
              {!when && <Icon name="clock" className="h-3.5 w-3.5" />}
              <span className="underline underline-offset-2">{when ? m.changeTime : m.setTime}</span>
            </summary>
            <div className="mt-2 flex flex-wrap items-end gap-2 rounded-xl border border-line bg-panel-2/40 p-3">
              <form action={setGameSchedule.bind(null, g.id, "set")} className="contents">
                <label>
                  <span className="label">{c.date}</span>
                  <input name="date" type="date" defaultValue={when ? dayOf(when) : localDay()} required />
                </label>
                <label>
                  <span className="label">{c.time}</span>
                  <input name="time" type="time" defaultValue={when ? localTime(new Date(when)) : "18:00"} required />
                </label>
                <label>
                  <span className="label">{c.place}</span>
                  <input name="place" defaultValue={g.place ?? ""} placeholder={c.placePlaceholder} maxLength={80} className="w-36" />
                </label>
                <SubmitButton className="btn btn-sm btn-primary" pendingText="…">
                  {msg.common.save}
                </SubmitButton>
              </form>
              {when && (
                <form action={setGameSchedule.bind(null, g.id, "clear")}>
                  <SubmitButton className="btn btn-sm btn-ghost text-muted" pendingText="…">
                    {m.removeTime}
                  </SubmitButton>
                </form>
              )}
              <p className="basis-full normal-case">{m.timeHint}</p>
            </div>
          </details>
        )}
      </div>
    );
  };

  const side = (r: Row, color: Side) => {
    const white = color === "white";
    const id = white ? r.p.whiteId : r.p.blackId;
    const won = white ? r.whiteWon : r.blackWon;
    const lost = white ? r.blackWon : r.whiteWon;
    const before = (white ? r.g?.whiteRatingBefore : r.g?.blackRatingBefore) ?? null;
    const after = (white ? r.g?.whiteRatingAfter : r.g?.blackRatingAfter) ?? null;
    return (
      <span className={`flex items-center gap-2 min-w-0 ${lost ? "text-muted" : ""} ${won ? "font-semibold" : ""}`}>
        <ColorDot color={color} />
        <PlayerLink id={id} name={white ? r.wn : r.bn} rating={before ?? names.get(id)?.rating} />
        <RatingDelta before={before} after={after} />
      </span>
    );
  };

  const bye = round.byePlayerId ? (
    <span className="flex items-center gap-2">
      <span className="h-3 w-3" />
      <PlayerLink id={round.byePlayerId} name={nameOf(names, round.byePlayerId)} />
      <span className="text-muted text-xs">{msg.common.bye}</span>
    </span>
  ) : null;

  return (
    <>
      {/* Phone: one card per board, result controls on their own full-width row. */}
      <ul className="md:hidden divide-y divide-line/60">
        {rows.map((r) => (
          <li
            key={r.p.gameId}
            className={`px-4 py-3 flex flex-col gap-2 ${r.mine ? "bg-accent/10" : r.res ? "" : "bg-accent/[0.03]"}`}
          >
            <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-muted">
              <span className="font-mono">
                {msg.common.board} {r.p.board}
                {r.label && <span className="ml-2 text-accent font-sans">{r.label}</span>}
              </span>
              {r.mine && <span className="text-accent font-sans">{msg.common.you}</span>}
            </div>
            <div className="flex flex-col gap-1.5 text-sm">
              {side(r, "white")}
              {side(r, "black")}
            </div>
            {schedule(r)}
            <div className="pt-1 [&_[role=group]]:flex [&_[role=group]]:w-full [&_[role=group]_button]:flex-1">
              {result(r)}
            </div>
          </li>
        ))}
        {bye && (
          <li className="px-4 py-3 flex items-center justify-between text-sm">
            {bye}
            <span className="font-mono text-muted text-xs">{msg.tournaments.game.freePoint}</span>
          </li>
        )}
      </ul>

      {/* Desktop: the classic four-column table. */}
      <div className="hidden md:block scroll-x">
        <table className="table">
          <thead>
            <tr>
              <th className="w-16">{msg.common.board}</th>
              <th>
                <span className="inline-flex items-center gap-1.5">
                  <ColorDot color="white" /> {msg.common.white}
                </span>
              </th>
              <th>
                <span className="inline-flex items-center gap-1.5">
                  <ColorDot color="black" /> {msg.common.black}
                </span>
              </th>
              <th className="w-52">{msg.common.result}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const when = schedule(r);
              const tone = `${r.res ? "" : "bg-accent/[0.03]"} ${r.mine ? "bg-accent/10" : ""}`;
              return (
                <Fragment key={r.p.gameId}>
                  <tr className={`${tone} ${when ? "[&>td]:border-b-0" : ""}`}>
                    <td className="font-mono text-muted">
                      {r.p.board}
                      {r.mine && (
                        <span className="block text-[10px] uppercase tracking-wider text-accent font-sans">
                          {msg.common.you}
                        </span>
                      )}
                      {r.label && (
                        <span className="block text-[10px] uppercase tracking-wider text-accent font-sans whitespace-nowrap">
                          {r.label}
                        </span>
                      )}
                    </td>
                    <td>{side(r, "white")}</td>
                    <td>{side(r, "black")}</td>
                    <td>{result(r)}</td>
                  </tr>
                  {/* The board's date sits on a line of its own, so the table keeps its four columns. */}
                  {when && (
                    <tr className={tone}>
                      <td className="!pt-0" />
                      <td colSpan={3} className="!pt-0">
                        {when}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {bye && (
              <tr>
                <td className="font-mono text-muted">–</td>
                <td colSpan={2}>{bye}</td>
                <td className="font-mono text-muted text-xs">{msg.tournaments.game.freePoint}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
