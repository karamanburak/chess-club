import type { MatchState } from "@/lib/queries";
import type { KnockoutMatch, Player } from "@/lib/types";
import { Avatar } from "./ui";

export interface BracketRound {
  number: number;
  name: string;
  matches: (KnockoutMatch & { state: MatchState })[];
}

function Side({ id, seed, score, names, winner, loser, pending, walkover }: { id: string | null; seed: number | null; score: number; names: Map<string, Player>; winner: boolean; loser: boolean; pending: boolean; walkover: boolean }) {
  if (!id) return <div className="flex items-center gap-2 px-3 py-2 text-muted text-sm italic">bye</div>;
  const name = names.get(id)?.name ?? "?";
  return (
    <div className={`flex items-center gap-2 px-3 py-2 text-sm ${winner ? "font-semibold" : loser ? "text-muted" : ""}`}>
      {seed !== null && <span className="text-[10px] text-muted font-mono w-4 text-right">{seed}</span>}
      <Avatar id={id} name={name} size="xs" />
      <span className="truncate flex-1">{name}</span>
      {!pending && !walkover && <span className={`font-mono text-xs ${winner ? "text-accent" : "text-muted"}`}>{score === 0.5 ? "½" : score % 1 === 0 ? score : score.toFixed(1).replace(".5", "½")}</span>}
      {winner && <span className="text-accent">✓</span>}
    </div>
  );
}

export function Bracket({ rounds, names, currentRound }: { rounds: BracketRound[]; names: Map<string, Player>; currentRound: number }) {
  return (
    <div className="scroll-x">
      <div className="flex gap-6 min-w-max p-1">
        {rounds.map((r) => (
          <div key={r.number} className="flex flex-col w-60">
            <div className={`text-[11px] uppercase tracking-wider mb-2 px-1 ${r.number === currentRound ? "text-accent" : "text-muted"}`}>
              {r.name}
              {r.number > currentRound && <span className="ml-1 opacity-60">· upcoming</span>}
            </div>
            <div className="flex flex-col justify-around flex-1 gap-3">
              {r.matches.map((m) => {
                const decided = !!m.winnerId;
                const pending = m.state.played === 0 && !m.state.walkover;
                return (
                  <div key={m.id} className={`rounded-xl border overflow-hidden bg-panel ${m.thirdPlace ? "border-dashed" : ""} ${decided ? "border-line" : r.number === currentRound ? "border-accent/50" : "border-line/60"}`}>
                    {m.thirdPlace && <div className="text-[10px] uppercase tracking-wider text-muted px-3 pt-1.5">3rd place</div>}
                    <Side id={m.a} seed={m.seedA} score={m.state.scoreA} names={names} winner={decided && m.winnerId === m.a} loser={decided && m.winnerId !== m.a} pending={pending} walkover={m.state.walkover} />
                    <div className="border-t border-line/60" />
                    <Side id={m.b} seed={m.seedB} score={m.state.scoreB} names={names} winner={decided && m.winnerId === m.b} loser={decided && m.winnerId !== m.b} pending={pending} walkover={m.state.walkover} />
                    {!decided && m.state.played > 0 && m.state.pending > 0 && m.state.scoreA === m.state.scoreB && (
                      <div className="text-[10px] text-accent px-3 pb-1.5">tiebreak game pending</div>
                    )}
                  </div>
                );
              })}
              {r.matches.length === 0 && (
                <div className="rounded-xl border border-dashed border-line/60 text-muted text-xs text-center py-6">
                  {2 ** (rounds.length - r.number)} match{2 ** (rounds.length - r.number) === 1 ? "" : "es"}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
