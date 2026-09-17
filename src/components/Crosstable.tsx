import type { CrossCell, StandingRow } from "@/lib/queries";
import { fmt, type Dict } from "@/lib/i18n";
import { Avatar } from "./ui";

function cellLabel(cells: CrossCell[] | undefined, m: Dict["tournaments"]["cross"]): { text: string; cls: string; title: string } {
  if (!cells?.length) return { text: "·", cls: "text-muted/40", title: m.notPlayed };
  const parts = cells.map((c) => (c.forfeit ? (c.score === 1 ? "+" : "–") : c.score === 0.5 ? "½" : String(c.score)));
  const total = cells.reduce((s, c) => s + c.score, 0);
  const cls = total === cells.length ? "text-win font-semibold" : total === 0 ? "text-loss" : "text-draw";
  const title = cells
    .map((c) => fmt(m.cell, { round: c.round, color: c.color === "white" ? m.white : m.black, result: c.forfeit ? m.forfeit : c.score }))
    .join(", ");
  return { text: parts.join(" "), cls, title };
}

/** Server component; the page passes its dictionary as `msg`. */
export function Crosstable({ rows, table, msg }: { rows: StandingRow[]; table: Map<string, Map<string, CrossCell[]>>; msg: Dict }) {
  return (
    <div className="scroll-x">
      <table className="table table-compact text-center">
        <thead>
          <tr>
            <th className="text-left hidden sm:table-cell">#</th>
            <th className="text-left sticky left-0 z-10 bg-panel">{msg.common.player}</th>
            {rows.map((_, i) => (
              <th key={i} className="text-center font-mono">
                {i + 1}
              </th>
            ))}
            <th className="text-right">{msg.common.points}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.playerId}>
              <td className="text-left font-mono text-muted hidden sm:table-cell">{i + 1}</td>
              <td className="text-left whitespace-nowrap sticky left-0 z-10 bg-panel shadow-[1px_0_0_var(--color-line)]">
                <span className="inline-flex items-center gap-2">
                  <span className="font-mono text-muted text-xs sm:hidden w-4">{i + 1}</span>
                  <Avatar id={r.playerId} name={r.name} size="xs" />
                  <span className={`max-w-24 sm:max-w-none truncate ${r.withdrawn ? "line-through text-muted" : "font-medium"}`}>{r.name}</span>
                </span>
              </td>
              {rows.map((c, j) => {
                if (i === j) return <td key={c.playerId} className="bg-panel-2/60" />;
                const info = cellLabel(table.get(r.playerId)?.get(c.playerId), msg.tournaments.cross);
                return (
                  <td key={c.playerId} className={`font-mono ${info.cls}`} title={info.title}>
                    {info.text}
                  </td>
                );
              })}
              <td className="text-right font-mono text-accent font-medium">{r.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
