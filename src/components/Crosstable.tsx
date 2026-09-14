import type { CrossCell, StandingRow } from "@/lib/queries";
import { Avatar } from "./ui";

function cellLabel(cells: CrossCell[] | undefined): { text: string; cls: string; title: string } {
  if (!cells?.length) return { text: "·", cls: "text-muted/40", title: "Not played" };
  const parts = cells.map((c) => (c.forfeit ? (c.score === 1 ? "+" : "–") : c.score === 0.5 ? "½" : String(c.score)));
  const total = cells.reduce((s, c) => s + c.score, 0);
  const cls = total === cells.length ? "text-win font-semibold" : total === 0 ? "text-loss" : "text-draw";
  const title = cells.map((c) => `R${c.round} as ${c.color}: ${c.forfeit ? "forfeit" : c.score}`).join(", ");
  return { text: parts.join(" "), cls, title };
}

export function Crosstable({ rows, table }: { rows: StandingRow[]; table: Map<string, Map<string, CrossCell[]>> }) {
  return (
    <div className="scroll-x">
      <table className="table table-compact text-center">
        <thead>
          <tr>
            <th className="text-left">#</th>
            <th className="text-left">Player</th>
            {rows.map((_, i) => (
              <th key={i} className="text-center font-mono">
                {i + 1}
              </th>
            ))}
            <th className="text-right">Pts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.playerId}>
              <td className="text-left font-mono text-muted">{i + 1}</td>
              <td className="text-left whitespace-nowrap">
                <span className="inline-flex items-center gap-2">
                  <Avatar id={r.playerId} name={r.name} size="xs" />
                  <span className={r.withdrawn ? "line-through text-muted" : "font-medium"}>{r.name}</span>
                </span>
              </td>
              {rows.map((c, j) => {
                if (i === j) return <td key={c.playerId} className="bg-panel-2/60" />;
                const info = cellLabel(table.get(r.playerId)?.get(c.playerId));
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
