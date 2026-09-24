import { localeOf, plural, type Dict, type Lang } from "@/lib/i18n";
import { puzzleDay, puzzleStats } from "@/lib/puzzle-stats";
import { formatDate } from "@/lib/queries";
import { localTime } from "@/lib/time";
import type { Database } from "@/lib/types";
import { Avatar, Empty, Pill, PlayerLink, Section } from "./ui";

/** Admin only: who finished today's puzzle and how, and everyone's numbers over all days. */
export function PuzzleAdminCard({ db, today, t, lang }: { db: Database; today: string; t: Dict; lang: Lang }) {
  const m = t.admin.puzzle;
  const name = (id: string) => db.players.find((p) => p.id === id)?.name ?? "?";
  const todays = puzzleDay(db, today);
  const stats = puzzleStats(db, today);
  return (
    <Section title={m.title}>
      <p className="-mt-2 mb-4 text-xs text-muted">{m.hint}</p>
      <div className="grid gap-6 lg:grid-cols-[2fr_3fr]">
        <div>
          <div className="label mb-2">
            {m.today} · {formatDate(today, lang)}
          </div>
          {todays.length === 0 ? (
            <p className="text-sm text-muted">{m.nobody}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line/60">
              {todays.map((s) => (
                <li key={s.playerId} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                  <Avatar id={s.playerId} name={name(s.playerId)} size="sm" />
                  <PlayerLink id={s.playerId} name={name(s.playerId)} />
                  <Pill tone={s.result === "solved" ? "win" : "loss"}>{s.result === "solved" ? m.solved : m.shown}</Pill>
                  {s.result === "solved" && s.misses === 0 && !s.hint ? <Pill tone="accent">{m.clean}</Pill> : s.misses > 0 && <span className="text-xs text-muted">{plural(s.misses, m.misses)}</span>}
                  {s.hint && <Pill>{m.withHint}</Pill>}
                  <span className="ml-auto text-xs text-muted font-mono">{localTime(new Date(s.at))}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="min-w-0">
          <div className="label mb-2">{m.allTime}</div>
          {stats.length === 0 ? (
            <Empty icon="pawn" title={m.none} />
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>{m.col.player}</th>
                  <th className="text-right">{m.col.solved}</th>
                  <th className="text-right">{m.col.streak}</th>
                  <th className="text-right hidden lg:table-cell">{m.col.best}</th>
                  <th className="text-right hidden lg:table-cell">{m.col.clean}</th>
                  <th className="text-right hidden xl:table-cell">{m.col.hints}</th>
                  <th className="text-right hidden xl:table-cell">{m.col.shown}</th>
                  <th className="text-right hidden xl:table-cell">{m.col.avg}</th>
                  <th className="text-right hidden lg:table-cell">{m.col.last}</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((r) => (
                  <tr key={r.playerId}>
                    <td>
                      <PlayerLink id={r.playerId} name={name(r.playerId)} />
                    </td>
                    <td className="text-right font-mono">{r.solved}</td>
                    <td className="text-right font-mono">{r.streak}</td>
                    <td className="text-right font-mono hidden lg:table-cell">{r.best}</td>
                    <td className="text-right font-mono hidden lg:table-cell">{r.clean}</td>
                    <td className="text-right font-mono hidden xl:table-cell">{r.hints}</td>
                    <td className="text-right font-mono hidden xl:table-cell">{r.shown}</td>
                    <td className="text-right font-mono hidden xl:table-cell">{r.avgMisses.toLocaleString(localeOf(lang))}</td>
                    <td className="text-right text-xs text-muted hidden lg:table-cell">{r.last ? formatDate(r.last, lang) : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </Section>
  );
}
