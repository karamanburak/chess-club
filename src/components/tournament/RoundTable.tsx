import { ResultButtons } from "@/components/ResultButtons";
import { ColorDot, PlayerLink, RatingDelta } from "@/components/ui";
import { fmt, type Dict } from "@/lib/i18n";
import { nameOf, resultLabel } from "@/lib/score";
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
}: {
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
            {rows.map((r) => (
              <tr key={r.p.gameId} className={`${r.res ? "" : "bg-accent/[0.03]"} ${r.mine ? "bg-accent/10" : ""}`}>
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
            ))}
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
