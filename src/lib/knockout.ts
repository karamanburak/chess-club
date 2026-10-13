import { newId } from "./db";
import { UserError } from "./errors";
import { makeGame } from "./games";
import { assignColors, bracketSeedOrder, nextPowerOfTwo } from "./pairing";
import { scoreFor } from "./elo";
import { activeParticipants, colorStats, knockoutRounds, matchState, playerMap } from "./queries";
import type { Database, KnockoutMatch, Tournament } from "./types";

/** The user-facing messages generateKnockoutRound() can throw; the server action passes the translated ones. */
export type KnockoutMessages = { bracketComplete: string; twoParticipants: string; matchesNeedWinner: string };
const DEFAULT_KO_MSGS: KnockoutMessages = {
  bracketComplete: "The bracket is complete.",
  twoParticipants: "At least two participants are needed.",
  matchesNeedWinner: "Every match of the current round needs a winner first (ties get an automatic tiebreak game).",
};

/**
 * Knockout brackets: seeding, advancing winners, tiebreak games and the third-place match.
 * Pure functions over the in-memory Database; the server actions call them inside mutate().
 */

export function addMatchGame(db: Database, t: Tournament, m: KnockoutMatch, round: Tournament["rounds"][number]) {
  if (!m.a || !m.b) return;
  // Alternate colors game by game; the first game is balanced on history.
  const lastId = m.gameIds.at(-1);
  const lastGame = lastId ? db.games.find((g) => g.id === lastId) : undefined;
  const colors = lastGame
    ? { whiteId: lastGame.blackId, blackId: lastGame.whiteId }
    : assignColors(m.a, m.b, colorStats(db, { tournamentId: t.id }));
  const board = round.pairings.length + 1;
  const g = makeGame(db, { ...colors, rated: t.rated, tournamentId: t.id, round: m.round, board, sessionId: null });
  db.games.push(g);
  m.gameIds.push(g.id);
  round.pairings.push({ board, whiteId: g.whiteId, blackId: g.blackId, gameId: g.id });
}

/** Who goes through when both sides of a match withdrew: the better seed, side A when neither has one. */
function doubleWalkoverWinner(m: KnockoutMatch): string | null {
  const seedA = m.seedA ?? Number.POSITIVE_INFINITY;
  const seedB = m.seedB ?? Number.POSITIVE_INFINITY;
  return seedB < seedA ? m.b : m.a;
}

/** Removes the given games from the db, the round's boards and the match. */
function dropGames(db: Database, round: Tournament["rounds"][number], m: KnockoutMatch, ids: Set<string>) {
  if (!ids.size) return;
  db.games = db.games.filter((x) => !ids.has(x.id));
  round.pairings = round.pairings.filter((p) => !ids.has(p.gameId));
  m.gameIds = m.gameIds.filter((id) => !ids.has(id));
}

/** Keeps every match consistent with its games: adds tiebreak games on ties, removes stale ones, sets winners. */
export function syncKnockout(db: Database, t: Tournament) {
  const ko = t.knockout;
  if (!ko) return;
  const games = new Map(db.games.map((g) => [g.id, g]));
  const withdrawn = new Set(t.withdrawnIds);
  for (const m of ko.matches) {
    const round = t.rounds.find((r) => r.number === m.round);
    if (!round) continue;
    if (!m.a || !m.b) {
      m.winnerId = m.a ?? m.b;
      continue;
    }
    // A withdrawal hands the match to the opponent: its unplayed games go, so the round can complete. Once a later
    // round exists the match is history and stays as played; the withdrawn winner's next match is handed over instead.
    // Both sides withdrawn: the better seed goes through on paper and hands the next match over in turn.
    const aOut = withdrawn.has(m.a);
    const bOut = withdrawn.has(m.b);
    if ((aOut || bOut) && !t.rounds.some((r) => r.number > m.round)) {
      dropGames(db, round, m, new Set(m.gameIds.filter((id) => !games.get(id)?.result)));
      m.winnerId = aOut && bOut ? doubleWalkoverWinner(m) : aOut ? m.b : m.a;
      continue;
    }
    // Extra games are justified only by a tie: drop every unplayed one unless the base games are complete and the
    // score before it is level, and then keep only the first (a corrected base result removes a stale tiebreak).
    const base = ko.gamesPerMatch;
    const stale = new Set<string>();
    let scoreA = 0;
    let scoreB = 0;
    let allPlayed = true;
    m.gameIds.forEach((id, i) => {
      const g = games.get(id);
      if (!g) {
        stale.add(id);
        return;
      }
      if (g.result) {
        const sw = scoreFor(g.result, "white");
        scoreA += g.whiteId === m.a ? sw : 1 - sw;
        scoreB += g.whiteId === m.a ? 1 - sw : sw;
        return;
      }
      if (i >= base && !(allPlayed && scoreA === scoreB)) stale.add(id);
      allPlayed = false;
    });
    dropGames(db, round, m, stale);

    const st = matchState(db, m, games);
    if (st.pending > 0) {
      m.winnerId = null;
      continue;
    }
    if (st.scoreA === st.scoreB) {
      m.winnerId = null;
      addMatchGame(db, t, m, round); // tiebreak, colors swapped
      const added = db.games.at(-1);
      if (added) games.set(added.id, added);
    } else {
      m.winnerId = st.scoreA > st.scoreB ? m.a : m.b;
    }
  }
}

export function generateKnockoutRound(db: Database, t: Tournament, msg: KnockoutMessages = DEFAULT_KO_MSGS) {
  const ko = t.knockout!;
  const total = knockoutRounds(t);
  const roundNumber = t.rounds.length + 1;
  if (roundNumber > total) throw new UserError(msg.bracketComplete);
  const withdrawn = new Set(t.withdrawnIds);
  const round = { number: roundNumber, pairings: [], byePlayerId: null, createdAt: new Date().toISOString() };
  const newMatches: KnockoutMatch[] = [];

  if (roundNumber === 1) {
    if (t.participantIds.length < 2) throw new UserError(msg.twoParticipants);
    const players = playerMap(db);
    const seeds = activeParticipants(t).sort((x, y) => (players.get(y)?.rating ?? 0) - (players.get(x)?.rating ?? 0));
    ko.bracketSize = nextPowerOfTwo(seeds.length);
    ko.matches = [];
    const order = bracketSeedOrder(ko.bracketSize);
    for (let i = 0; i < order.length; i += 2) {
      const sa = order[i];
      const sb = order[i + 1];
      const a = seeds[sa - 1] ?? null;
      const b = seeds[sb - 1] ?? null;
      newMatches.push({ id: newId(), round: 1, slot: i / 2 + 1, a, b, seedA: a ? sa : null, seedB: b ? sb : null, gameIds: [], winnerId: a && b ? null : (a ?? b), thirdPlace: false });
    }
  } else {
    const prev = ko.matches.filter((m) => m.round === roundNumber - 1 && !m.thirdPlace).sort((x, y) => x.slot - y.slot);
    // Withdrawn players hand the match to their opponent.
    for (const m of prev) {
      if (m.winnerId) continue;
      const aOut = !!m.a && withdrawn.has(m.a);
      const bOut = !!m.b && withdrawn.has(m.b);
      if (aOut && bOut) m.winnerId = doubleWalkoverWinner(m);
      else if (aOut !== bOut) m.winnerId = aOut ? m.b : m.a;
    }
    if (prev.some((m) => !m.winnerId)) throw new UserError(msg.matchesNeedWinner);
    const seedOf = (id: string | null) => {
      const m = ko.matches.find((x) => x.round === 1 && (x.a === id || x.b === id));
      return m ? (m.a === id ? m.seedA : m.seedB) : null;
    };
    for (let i = 0; i < prev.length; i += 2) {
      const a = prev[i].winnerId;
      const b = prev[i + 1]?.winnerId ?? null;
      newMatches.push({ id: newId(), round: roundNumber, slot: i / 2 + 1, a, b, seedA: seedOf(a), seedB: seedOf(b), gameIds: [], winnerId: a && b ? null : (a ?? b), thirdPlace: false });
    }
    if (roundNumber === total && ko.thirdPlace && prev.length === 2) {
      const la = prev[0].winnerId === prev[0].a ? prev[0].b : prev[0].a;
      const lb = prev[1].winnerId === prev[1].a ? prev[1].b : prev[1].a;
      if (la && lb) newMatches.push({ id: newId(), round: roundNumber, slot: 2, a: la, b: lb, seedA: seedOf(la), seedB: seedOf(lb), gameIds: [], winnerId: null, thirdPlace: true });
    }
  }

  ko.matches.push(...newMatches);
  t.rounds.push(round);
  for (const m of newMatches) {
    if (!m.a || !m.b) continue;
    for (let i = 0; i < ko.gamesPerMatch; i++) addMatchGame(db, t, m, round);
  }
}
