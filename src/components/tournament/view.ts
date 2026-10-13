import { fmt, type Dict } from "@/lib/i18n";
import { knockoutRoundName, knockoutRounds, roundComplete } from "@/lib/queries";
import type { Database, Game, Player, Tournament } from "@/lib/types";

/** Everything the tournament page's cards derive from the tournament, computed once per request. */
export interface TournamentView {
  t: Tournament;
  names: Map<string, Player>;
  games: Map<string, Game>;
  last: Tournament["rounds"][number] | null;
  lastComplete: boolean;
  roundsLeft: number;
  activeCount: number;
  isKO: boolean;
  isRR: boolean;
  finished: boolean;
  koTotal: number;
  canGenerate: boolean;
  /** "Semifinals" for a knockout, "Round 3" otherwise. */
  roundTitle: (n: number) => string;
  /** Button labels: "Advance to semifinals" / "Pair round 3". */
  nextRoundLabel: (template: string, roundTemplate: string) => string;
}

export function tournamentView(db: Database, t: Tournament, names: Map<string, Player>, msg: Dict): TournamentView {
  const last = t.rounds[t.rounds.length - 1] ?? null;
  const lastComplete = last ? roundComplete(db, t, last.number) : true;
  const roundsLeft = t.plannedRounds - t.rounds.length;
  const activeCount = t.participantIds.length - t.withdrawnIds.length;
  const isKO = t.pairingMode === "knockout";
  const koTotal = isKO ? knockoutRounds(t) : 0;
  // A knockout round with an undecided match (neither side withdrawn) blocks the next round.
  const koBlocked =
    isKO &&
    !!last &&
    (t.knockout?.matches ?? []).some(
      (m) =>
        m.round === last.number &&
        !m.winnerId &&
        !(m.a && t.withdrawnIds.includes(m.a)) &&
        !(m.b && t.withdrawnIds.includes(m.b)),
    );
  const canGenerate = t.status !== "finished" && lastComplete && roundsLeft > 0 && activeCount >= 2 && !koBlocked;
  return {
    t,
    names,
    games: new Map(db.games.map((g) => [g.id, g])),
    last,
    lastComplete,
    roundsLeft,
    activeCount,
    isKO,
    isRR: t.pairingMode === "roundrobin",
    finished: t.status === "finished",
    koTotal,
    canGenerate,
    roundTitle: (n) => (isKO ? knockoutRoundName(n, koTotal, msg.tournaments.rounds) : fmt(msg.common.roundN, { n })),
    nextRoundLabel: (template, roundTemplate) =>
      isKO
        ? fmt(template, { round: knockoutRoundName(t.rounds.length + 1, koTotal, msg.tournaments.roundsInSentence) })
        : fmt(roundTemplate, { n: t.rounds.length + 1 }),
  };
}
