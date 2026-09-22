"use client";

import { useMemo, useState } from "react";
import type { PickablePlayer } from "@/lib/pick";
import { fmt, plural } from "@/lib/i18n";
import { FaceSvg } from "./Face";
import { useT } from "./I18nProvider";

type Sort = "name" | "elo";
const SHOW = 6;

/**
 * Picks one player: type to filter by name, or sort by Elo and pick from the top. Results are a dropdown shown
 * only while the box is focused or has text. The chosen player becomes a chip and a hidden field named `name`
 * carries the id; while nobody is chosen the search box is `required`, so the browser stops an empty form.
 * Controlled (`value` + `onChange`) when two pickers must know about each other, uncontrolled otherwise.
 */
export function PlayerPicker({
  name,
  players,
  defaultValue,
  value,
  onChange,
  placeholder,
  exclude,
  showGames,
  tone = "accent",
}: {
  name: string;
  players: PickablePlayer[];
  defaultValue?: string;
  value?: string | null;
  onChange?: (id: string | null) => void;
  placeholder?: string;
  /** Ids to leave out of the list, e.g. the other side of a merge. */
  exclude?: string[];
  showGames?: boolean;
  /** Chip colour: accent for a normal choice, loss for something that is about to be deleted. */
  tone?: "accent" | "loss";
}) {
  const { t } = useT();
  const c = t.common;
  const [inner, setInner] = useState<string | null>(defaultValue ?? null);
  const selectedId = value !== undefined ? value : inner;
  const setSelected = (id: string | null) => {
    setInner(id);
    onChange?.(id);
  };
  const selected = selectedId ? players.find((p) => p.id === selectedId) ?? null : null;
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("name");
  const [focused, setFocused] = useState(false);
  const open = focused || query.trim() !== "";

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const hits = players.filter((p) => !exclude?.includes(p.id) && (!q || p.name.toLowerCase().includes(q)));
    // Name matches that start with the query first, then the rest; by Elo the strongest first.
    hits.sort((a, b) => {
      if (sort === "elo") return b.rating - a.rating || a.name.localeCompare(b.name);
      const as = q && a.name.toLowerCase().startsWith(q) ? 0 : 1;
      const bs = q && b.name.toLowerCase().startsWith(q) ? 0 : 1;
      return as - bs || a.name.localeCompare(b.name);
    });
    return hits;
  }, [players, query, sort, exclude]);

  // Name on top, the numbers underneath in small mono: survives a narrow column without wrapping mid-phrase.
  const who = (p: PickablePlayer) => (
    <span className="flex min-w-0 flex-col leading-tight">
      <span className="truncate font-medium">{p.name}</span>
      <span className="font-mono text-[11px] text-muted whitespace-nowrap">
        {p.rating}
        {showGames && p.games !== undefined && ` · ${plural(p.games, c.gamesN)}`}
      </span>
    </span>
  );

  if (selected) {
    const chip = tone === "loss" ? "border-loss/50 bg-loss/10" : "border-accent/60 bg-accent/10";
    return (
      <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${chip}`}>
        <input type="hidden" name={name} value={selected.id} />
        <FaceSvg seed={selected.avatar} title={selected.name} className="h-8 w-8 shrink-0 rounded-full ring-1 ring-line/70" />
        {who(selected)}
        <button type="button" className="btn btn-sm btn-ghost ml-auto shrink-0 text-xs" onClick={() => setSelected(null)}>
          {c.pickChange}
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <input type="hidden" name={name} value="" />
      <div className="flex gap-2">
        <input
          type="search"
          required
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            // Enter picks the top match instead of submitting a form that has no player yet.
            if (e.key === "Enter") {
              e.preventDefault();
              if (matches[0]) setSelected(matches[0].id);
            }
          }}
          placeholder={placeholder ?? c.pickSearch}
          aria-label={placeholder ?? c.pickSearch}
          autoComplete="off"
          className="flex-1 min-w-0"
        />
        <div className="inline-flex rounded-lg border border-line overflow-hidden text-xs" role="group" aria-label={c.pickSort}>
          {(["name", "elo"] as Sort[]).map((s) => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => e.preventDefault()} // keep the search box focused, so the list stays open
              onClick={() => setSort(s)}
              className={`px-2.5 py-1.5 transition-colors ${sort === s ? "bg-accent text-accent-fg" : "bg-panel-2 text-muted hover:text-fg"}`}
              aria-pressed={sort === s}
            >
              {s === "name" ? c.pickSortName : c.pickSortElo}
            </button>
          ))}
        </div>
      </div>
      {open && (
        // A dropdown, not a block in the form: the form keeps its height until someone starts looking.
        <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-y-auto flex flex-col divide-y divide-line/60 rounded-lg border border-line bg-panel shadow-xl fade-up">
          {matches.length === 0 && <li className="px-3 py-2 text-xs text-muted">{c.pickNoMatch}</li>}
          {matches.slice(0, SHOW).map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()} // select before the box blurs and the list closes
                onClick={() => setSelected(p.id)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-accent/10 transition-colors"
              >
                <FaceSvg seed={p.avatar} title={p.name} className="h-8 w-8 shrink-0 rounded-full ring-1 ring-line/70" />
                {who(p)}
              </button>
            </li>
          ))}
          {matches.length > SHOW && <li className="px-3 py-1.5 text-xs text-muted">{fmt(c.pickMore, { n: matches.length - SHOW })}</li>}
        </ul>
      )}
    </div>
  );
}
