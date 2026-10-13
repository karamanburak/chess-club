import Link from "next/link";
import { Crosstable } from "@/components/Crosstable";
import { Avatar, Empty, PlayerLink, Rank, Section } from "@/components/ui";
import type { Dict } from "@/lib/i18n";
import type { CrossCell, KnockoutPlacement, StandingRow } from "@/lib/queries";
import { nameOf } from "@/lib/score";
import type { Player, TiebreakKey, Tournament } from "@/lib/types";

const tiebreakValue = (r: StandingRow, k: TiebreakKey): number => {
  switch (k) {
    case "buchholz":
      return r.buchholz;
    case "sonneborn":
      return r.sonneborn;
    case "direct":
      return r.direct;
    case "progressive":
      return r.progressive;
    case "wins":
      return r.wins;
    case "blackwins":
      return r.blackWins;
  }
};

/** Standings table or crosstable (`?view=cross`) for every format except knockout. */
export function StandingsCard({
  t,
  table,
  cross,
  view,
  msg,
}: {
  t: Tournament;
  table: StandingRow[];
  cross: Map<string, Map<string, CrossCell[]>>;
  view: "standings" | "cross";
  msg: Dict;
}) {
  const started = t.rounds.length > 0;
  const tiebreakCols = t.tiebreaks.slice(0, 3);
  const tab = (active: boolean) => (active ? "bg-panel-2 text-fg" : "text-muted hover:text-fg");

  return (
    <Section
      title={view === "cross" ? msg.tournaments.crosstable : msg.tournaments.standings}
      flush
      right={
        started ? (
          <span className="inline-flex rounded-lg border border-line overflow-hidden text-xs no-print">
            <Link
              href={`/tournaments/${t.id}`}
              className={`px-2.5 py-1 ${tab(view === "standings")}`}
              aria-current={view === "standings" ? "page" : undefined}
            >
              {msg.tournaments.table}
            </Link>
            <Link
              href={`/tournaments/${t.id}?view=cross`}
              className={`px-2.5 py-1 border-l border-line ${tab(view === "cross")}`}
              aria-current={view === "cross" ? "page" : undefined}
            >
              {msg.tournaments.crosstable}
            </Link>
          </span>
        ) : undefined
      }
    >
      {table.length === 0 ? (
        <Empty icon="pawn" title={msg.tournaments.noParticipants} />
      ) : view === "cross" ? (
        <Crosstable rows={table} table={cross} msg={msg} />
      ) : (
        <div className="scroll-x">
          <table className="table">
            <thead>
              <tr>
                <th className="w-10 text-center">#</th>
                <th>{msg.common.player}</th>
                <th className="text-right">{msg.common.points}</th>
                {tiebreakCols.map((k, i) => (
                  <th
                    key={k}
                    className={`text-right ${i >= 2 ? "hidden lg:table-cell" : ""}`}
                    title={`${msg.tournaments.tiebreaks[k].label}: ${msg.tournaments.tiebreaks[k].help}`}
                  >
                    {msg.tournaments.tiebreaks[k].short}
                  </th>
                ))}
                <th className="text-right hidden xl:table-cell" title={msg.tournaments.perfTitle}>
                  {msg.tournaments.perfShort}
                </th>
              </tr>
            </thead>
            <tbody>
              {table.map((r, i) => (
                <tr key={r.playerId} className={i === 0 && started ? "bg-accent/[0.04]" : ""}>
                  <td className="text-center">{started ? <Rank n={i + 1} /> : <span className="text-muted">–</span>}</td>
                  <td>
                    <span className="flex items-center gap-2">
                      <Avatar id={r.playerId} name={r.name} size="xs" />
                      <PlayerLink
                        id={r.playerId}
                        name={r.name}
                        className={r.withdrawn ? "line-through text-muted" : "font-medium"}
                      />
                      <span className="text-xs text-muted font-mono">{r.rating}</span>
                      {r.byes > 0 && <span className="text-[10px] text-muted">{msg.common.bye}</span>}
                    </span>
                  </td>
                  <td className="text-right font-mono text-accent font-medium">{r.points}</td>
                  {tiebreakCols.map((k, j) => (
                    <td
                      key={k}
                      className={`text-right font-mono text-muted text-xs ${j >= 2 ? "hidden lg:table-cell" : ""}`}
                    >
                      {tiebreakValue(r, k)}
                    </td>
                  ))}
                  <td className="text-right font-mono text-muted text-xs hidden xl:table-cell">{r.performance ?? "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

/** Knockout placement table: where every player stands or went out. */
export function PlacementCard({
  placement,
  names,
  finished,
  msg,
}: {
  placement: KnockoutPlacement[];
  names: Map<string, Player>;
  finished: boolean;
  msg: Dict;
}) {
  return (
    <Section title={msg.tournaments.placement} flush>
      <table className="table [&_th]:px-2 [&_td]:px-2">
        <thead>
          <tr>
            <th className="w-10 text-center">#</th>
            <th>{msg.common.player}</th>
            <th>{msg.tournaments.status}</th>
            <th className="text-right">{msg.tournaments.matchWins}</th>
          </tr>
        </thead>
        <tbody>
          {placement.map((r) => (
            <tr key={r.playerId}>
              <td className="text-center">
                {finished && r.place <= 3 ? <Rank n={r.place} /> : <span className="font-mono text-muted">{r.place}</span>}
              </td>
              <td>
                <PlayerLink id={r.playerId} name={nameOf(names, r.playerId)} avatar className="font-medium" />
              </td>
              <td className="text-xs text-muted">{r.label}</td>
              <td className="text-right font-mono">{r.wins}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}
