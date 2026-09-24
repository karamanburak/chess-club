/**
 * Merging two player records into one (the same person added twice). Every reference to
 * `fromId` is rewritten to `intoId`, then the duplicate is removed. Pure: the caller runs it
 * inside mutate() and calls recomputeRatings() afterwards.
 */
import type { Database, Player } from "./types";

/** Why a merge cannot happen. The two records must never have met on a board or in one event. */
export type MergeProblem = "same" | "notFound" | "playedEachOther" | "sharedTournament" | "sharedSession";

export interface MergeSummary {
  games: number;
  tournaments: number;
  sessions: number;
}

export function mergeCheck(db: Database, fromId: string, intoId: string): MergeProblem | null {
  if (fromId === intoId) return "same";
  const from = db.players.find((p) => p.id === fromId);
  const into = db.players.find((p) => p.id === intoId);
  if (!from || !into) return "notFound";
  const both = (ids: string[]) => ids.includes(fromId) && ids.includes(intoId);
  if (db.games.some((g) => both([g.whiteId, g.blackId]))) return "playedEachOther";
  if (db.tournaments.some((t) => both(t.participantIds))) return "sharedTournament";
  if (db.sessions.some((s) => both(s.presentIds))) return "sharedSession";
  return null;
}

function swap(id: string, fromId: string, intoId: string): string {
  return id === fromId ? intoId : id;
}

function swapNullable(id: string | null, fromId: string, intoId: string): string | null {
  return id === fromId ? intoId : id;
}

/** Rewrites every reference and drops the duplicate. Throws on the problems mergeCheck() reports; check first. */
export function mergePlayers(db: Database, fromId: string, intoId: string): MergeSummary {
  const problem = mergeCheck(db, fromId, intoId);
  if (problem) throw new Error(`Cannot merge players: ${problem}`);
  const from = db.players.find((p) => p.id === fromId) as Player;
  const into = db.players.find((p) => p.id === intoId) as Player;

  const summary: MergeSummary = { games: 0, tournaments: 0, sessions: 0 };
  for (const g of db.games) {
    if (g.whiteId !== fromId && g.blackId !== fromId) continue;
    g.whiteId = swap(g.whiteId, fromId, intoId);
    g.blackId = swap(g.blackId, fromId, intoId);
    summary.games++;
  }
  for (const t of db.tournaments) {
    const touched = t.participantIds.includes(fromId) || t.withdrawnIds.includes(fromId) || !!t.rrOrder?.includes(fromId) || !!t.knockout?.matches.some((m) => m.a === fromId || m.b === fromId);
    if (!touched) continue;
    t.participantIds = t.participantIds.map((p) => swap(p, fromId, intoId));
    t.withdrawnIds = t.withdrawnIds.map((p) => swap(p, fromId, intoId));
    if (t.rrOrder) t.rrOrder = t.rrOrder.map((p) => swap(p, fromId, intoId));
    for (const r of t.rounds) {
      for (const p of r.pairings) {
        p.whiteId = swap(p.whiteId, fromId, intoId);
        p.blackId = swap(p.blackId, fromId, intoId);
      }
      r.byePlayerId = swapNullable(r.byePlayerId, fromId, intoId);
    }
    for (const m of t.knockout?.matches ?? []) {
      m.a = swapNullable(m.a, fromId, intoId);
      m.b = swapNullable(m.b, fromId, intoId);
      m.winnerId = swapNullable(m.winnerId, fromId, intoId);
    }
    summary.tournaments++;
  }
  for (const s of db.sessions) {
    if (!s.presentIds.includes(fromId) && !s.rounds.some((r) => r.byePlayerId === fromId || r.pairings.some((p) => p.whiteId === fromId || p.blackId === fromId))) continue;
    s.presentIds = s.presentIds.map((p) => swap(p, fromId, intoId));
    for (const r of s.rounds) {
      for (const p of r.pairings) {
        p.whiteId = swap(p.whiteId, fromId, intoId);
        p.blackId = swap(p.blackId, fromId, intoId);
      }
      r.byePlayerId = swapNullable(r.byePlayerId, fromId, intoId);
    }
    summary.sessions++;
  }
  for (const s of db.seasons) s.championId = swapNullable(s.championId, fromId, intoId);
  for (const c of db.challenges) {
    c.fromId = swap(c.fromId, fromId, intoId);
    c.toId = swap(c.toId, fromId, intoId);
    c.proposedBy = swap(c.proposedBy, fromId, intoId);
    c.whiteId = swapNullable(c.whiteId, fromId, intoId);
  }
  // A challenge the two records had with each other would now be one against oneself.
  db.challenges = db.challenges.filter((c) => c.fromId !== c.toId);
  // Puzzle days move over; where both records solved the same day, the surviving record's entry stays.
  const intoDays = new Set(db.puzzleSolves.filter((x) => x.playerId === intoId).map((x) => x.day));
  db.puzzleSolves = db.puzzleSolves.filter((x) => x.playerId !== fromId || !intoDays.has(x.day));
  for (const x of db.puzzleSolves) x.playerId = swap(x.playerId, fromId, intoId);

  // The surviving record keeps its own identity; it only inherits what it lacks.
  into.pinHash ??= from.pinHash;
  into.note ||= from.note;
  into.active = into.active || from.active;
  if (from.createdAt < into.createdAt) into.createdAt = from.createdAt;

  db.players = db.players.filter((p) => p.id !== fromId);
  return summary;
}
