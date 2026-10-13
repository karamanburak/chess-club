import type { Dict, Lang } from "@/lib/i18n";
import { puzzleDay } from "@/lib/puzzle-stats";
import { formatDate, playerMap } from "@/lib/queries";
import { nameOf } from "@/lib/score";
import type { Database } from "@/lib/types";
import { Avatar, Empty, Pill, PlayerLink, Section } from "./ui";

/** Days shown in the per-day table, newest first. */
const DAYS = 14;

/** Admin only: who finished today's puzzle (solved or saw the solution) and a plain count per day. No tries, no hints. */
export function PuzzleAdminCard({ db, today, t, lang }: { db: Database; today: string; t: Dict; lang: Lang }) {
  const m = t.puzzle.admin;
  const names = playerMap(db);
  const name = (id: string) => nameOf(names, id);
  const todays = puzzleDay(db, today);
  const perDay = new Map<string, { solved: number; shown: number }>();
  for (const s of db.puzzleSolves) {
    const row = perDay.get(s.day) ?? { solved: 0, shown: 0 };
    row[s.result === "solved" ? "solved" : "shown"]++;
    perDay.set(s.day, row);
  }
  const days = [...perDay.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, DAYS);
  return (
    <Section title={m.title}>
      <p className="-mt-2 mb-4 text-xs text-muted">{m.hint}</p>
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
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
                  <span className="ml-auto">
                    <Pill tone={s.result === "solved" ? "win" : "muted"}>{s.result === "solved" ? m.solved : m.shown}</Pill>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="min-w-0">
          <div className="label mb-2">{m.perDay}</div>
          {days.length === 0 ? (
            <Empty icon="pawn" title={m.none} />
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>{m.col.day}</th>
                  <th className="text-right">{m.col.solved}</th>
                  <th className="text-right">{m.col.shown}</th>
                </tr>
              </thead>
              <tbody>
                {days.map(([day, c]) => (
                  <tr key={day}>
                    <td>{formatDate(day, lang)}</td>
                    <td className="text-right font-mono">{c.solved}</td>
                    <td className="text-right font-mono">{c.shown}</td>
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
