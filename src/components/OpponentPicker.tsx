"use client";

import { useMemo, useState } from "react";
import type { ChallengeOpponent } from "@/lib/challenges";
import { FaceSvg } from "./Face";
import { Icon } from "./icons";
import { useT } from "./I18nProvider";
import { fmt } from "@/lib/i18n";

type Sort = "name" | "elo";
const SHOW = 8;

/**
 * Picks the opponent for a challenge: type to filter by name, or sort the club by Elo and pick from the top.
 * The chosen player becomes a chip; the hidden `toId` carries the id. While nobody is chosen the search box is
 * `required`, so the browser stops an empty form before the server has to.
 */
export function OpponentPicker({ players, defaultValue }: { players: ChallengeOpponent[]; defaultValue?: string }) {
  const { t } = useT();
  const m = t.challenges;
  const [selected, setSelected] = useState<ChallengeOpponent | null>(() => players.find((p) => p.id === defaultValue) ?? null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("name");

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const hits = players.filter((p) => !q || p.name.toLowerCase().includes(q));
    // Name matches that start with the query first, then the rest; by Elo the strongest first.
    hits.sort((a, b) => {
      if (sort === "elo") return b.rating - a.rating || a.name.localeCompare(b.name);
      const as = q && a.name.toLowerCase().startsWith(q) ? 0 : 1;
      const bs = q && b.name.toLowerCase().startsWith(q) ? 0 : 1;
      return as - bs || a.name.localeCompare(b.name);
    });
    return hits;
  }, [players, query, sort]);

  if (selected) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-accent/60 bg-accent/10 px-3 py-2">
        <input type="hidden" name="toId" value={selected.id} />
        <FaceSvg seed={selected.avatar} title={selected.name} className="h-7 w-7 shrink-0 rounded-full ring-1 ring-line/70" />
        <span className="font-medium truncate">{selected.name}</span>
        <span className="font-mono text-xs text-muted">{selected.rating}</span>
        <button type="button" className="btn btn-sm btn-ghost ml-auto text-xs" onClick={() => setSelected(null)}>
          {m.change}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name="toId" value="" />
      <div className="flex gap-2">
        <input
          type="search"
          required
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            // Enter picks the top match instead of submitting a form that has no opponent yet.
            if (e.key === "Enter") {
              e.preventDefault();
              if (matches[0]) setSelected(matches[0]);
            }
          }}
          placeholder={m.searchOpponent}
          aria-label={m.opponent}
          autoComplete="off"
          className="flex-1 min-w-0"
        />
        <div className="inline-flex rounded-lg border border-line overflow-hidden text-xs" role="group" aria-label={m.sortBy}>
          {(["name", "elo"] as Sort[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSort(s)}
              className={`px-2.5 py-1.5 transition-colors ${sort === s ? "bg-accent text-accent-fg" : "bg-panel-2 text-muted hover:text-fg"}`}
              aria-pressed={sort === s}
            >
              {s === "name" ? m.sortName : m.sortElo}
            </button>
          ))}
        </div>
      </div>
      {matches.length === 0 ? (
        <p className="text-xs text-muted px-1">{m.noOpponent}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line/60 rounded-lg border border-line bg-panel-2/40 max-h-72 overflow-y-auto">
          {matches.slice(0, SHOW).map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => setSelected(p)} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-accent/10 transition-colors">
                <FaceSvg seed={p.avatar} title={p.name} className="h-7 w-7 shrink-0 rounded-full ring-1 ring-line/70" />
                <span className="truncate">{p.name}</span>
                <span className="ml-auto font-mono text-xs text-muted">{p.rating}</span>
                <Icon name="swords" className="h-3.5 w-3.5 text-muted" />
              </button>
            </li>
          ))}
          {matches.length > SHOW && <li className="px-3 py-1.5 text-xs text-muted">{fmt(m.moreOpponents, { n: matches.length - SHOW })}</li>}
        </ul>
      )}
    </div>
  );
}
