import { PlayerLink, Rank } from "@/components/ui";
import { fmt, type Dict } from "@/lib/i18n";
import type { KnockoutPlacement, StandingRow } from "@/lib/queries";
import { nameOf } from "@/lib/score";
import type { Player } from "@/lib/types";

/** The top three of a finished tournament: bracket placement for a knockout, the standings otherwise. */
export function Podium({
  isKO,
  placement,
  table,
  names,
  msg,
}: {
  isKO: boolean;
  placement: KnockoutPlacement[];
  table: StandingRow[];
  names: Map<string, Player>;
  msg: Dict;
}) {
  const rows = isKO
    ? placement.slice(0, 3).map((r) => ({ id: r.playerId, name: nameOf(names, r.playerId), detail: r.label, mono: false }))
    : table.slice(0, 3).map((r) => ({
        id: r.playerId,
        name: r.name,
        detail:
          fmt(msg.common.pointsN, { n: r.points }) +
          (r.performance !== null ? ` · ${fmt(msg.tournaments.perfN, { n: r.performance })}` : ""),
        mono: true,
      }));
  if (rows.length === 0) return null;

  return (
    <div className="card mb-6 border-accent/40 bg-gradient-to-r from-accent/10 to-transparent flex flex-wrap items-center gap-6">
      {rows.map((r, i) => (
        <div key={r.id} className={`flex items-center gap-3 ${i === 0 ? "" : "opacity-80"}`}>
          <span className={`inline-flex origin-center ${i === 0 ? "scale-150 mx-1.5" : "scale-125 mx-1"}`}>
            <Rank n={i + 1} />
          </span>
          <div>
            <div className={`font-semibold ${i === 0 ? "text-lg" : ""}`}>
              <PlayerLink id={r.id} name={r.name} />
            </div>
            <div className={`text-xs text-muted ${r.mono ? "font-mono" : ""}`}>{r.detail}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
