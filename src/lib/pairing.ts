export interface PairingCandidate {
  id: string;
  score: number;
  rating: number;
}

export interface ColorStats {
  white: number;
  black: number;
  last: "white" | "black" | null;
  /** How many consecutive games the player has had `last` color. */
  streak: number;
}

export interface PairingInput {
  players: PairingCandidate[];
  /** Pairs that must not meet again if at all avoidable (e.g. same tournament / same evening). */
  previousPairs: Set<string>;
  /** Pairs that should preferably not meet again (e.g. all-time history on a club night). */
  softPairs?: Set<string>;
  colorStats: Map<string, ColorStats>;
  byeHistory: Set<string>;
  mode: "random" | "swiss";
}

export interface PairingOutput {
  pairs: { whiteId: string; blackId: string }[];
  byeId: string | null;
  rematches: number;
}

export const EMPTY_COLOR: ColorStats = { white: 0, black: 0, last: null, streak: 0 };

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const HARD = 100;
const SOFT = 1;

/** Greedy pairing in the given order: prefer opponents that have not been met yet. */
function greedyPair(order: PairingCandidate[], hard: Set<string>, soft: Set<string>) {
  const remaining = [...order];
  const pairs: [PairingCandidate, PairingCandidate][] = [];
  let cost = 0;
  while (remaining.length >= 2) {
    const a = remaining.shift()!;
    let bestIdx = 0;
    let bestCost = Number.POSITIVE_INFINITY;
    for (let i = 0; i < remaining.length; i++) {
      const k = pairKey(a.id, remaining[i].id);
      const c = hard.has(k) ? HARD : soft.has(k) ? SOFT : 0;
      // Add a tiny position penalty so, at equal cost, the natural order (score group) wins.
      const total = c + i * 0.001;
      if (total < bestCost) {
        bestCost = total;
        bestIdx = i;
        if (c === 0) break;
      }
    }
    const b = remaining.splice(bestIdx, 1)[0];
    cost += Math.floor(bestCost);
    pairs.push([a, b]);
  }
  return { pairs, cost };
}

/** Nodes the Swiss search may visit before it settles for the best pairing found so far (a few ms). */
const SWISS_BUDGET = 200_000;

/**
 * Swiss: the pairing with the fewest rematches (hard, then soft) and, among those, the smallest score gaps, found by
 * a depth-first search with pruning. Neighbours in the standings are tried first, so the first complete pairing is
 * the greedy one and the search only ever improves on it. A shuffle cannot do this: the score order undoes it.
 */
function swissPair(pool: PairingCandidate[], hard: Set<string>, soft: Set<string>) {
  const order = [...pool].sort((a, b) => b.score - a.score || b.rating - a.rating);
  const n = order.length;
  const pairCost = (i: number, j: number) => {
    const k = pairKey(order[i].id, order[j].id);
    return hard.has(k) ? HARD : soft.has(k) ? SOFT : 0;
  };
  // Half-points apart, then places apart: keeps players in their score group.
  const gap = (i: number, j: number) => Math.round(Math.abs(order[i].score - order[j].score) * 2) * n + (j - i);
  const used = new Array<boolean>(n).fill(false);
  const current: [number, number][] = [];
  let best: { pairs: [number, number][]; cost: number; gap: number } | null = null;
  let nodes = 0;

  const search = (cost: number, gaps: number) => {
    if (best && (cost > best.cost || (cost === best.cost && gaps >= best.gap))) return;
    if (++nodes > SWISS_BUDGET && best) return;
    const i = used.indexOf(false);
    if (i === -1) {
      best = { pairs: [...current], cost, gap: gaps };
      return;
    }
    used[i] = true;
    const options: number[] = [];
    for (let j = i + 1; j < n; j++) if (!used[j]) options.push(j);
    options.sort((x, y) => pairCost(i, x) - pairCost(i, y) || gap(i, x) - gap(i, y));
    for (const j of options) {
      used[j] = true;
      current.push([i, j]);
      search(cost + pairCost(i, j), gaps + gap(i, j));
      current.pop();
      used[j] = false;
    }
    used[i] = false;
  };
  search(0, 0);
  const found = best as { pairs: [number, number][]; cost: number } | null;
  return {
    pairs: (found?.pairs ?? []).map(([i, j]): [PairingCandidate, PairingCandidate] => [order[i], order[j]]),
    cost: found?.cost ?? 0,
  };
}

/**
 * Decide who plays white.
 * 1. Nobody gets the same color three times in a row if avoidable.
 * 2. The player with the lower (white - black) balance gets white.
 * 3. Whoever had black last gets white.
 * 4. `tieBreak` — a coin flip by default; schedules that must be reproducible pass their own.
 */
export function assignColors(a: string, b: string, colorStats: Map<string, ColorStats>, tieBreak: () => boolean = () => Math.random() < 0.5): { whiteId: string; blackId: string } {
  const sa = colorStats.get(a) ?? EMPTY_COLOR;
  const sb = colorStats.get(b) ?? EMPTY_COLOR;

  const mustBeBlack = (s: ColorStats) => s.last === "white" && s.streak >= 2;
  const mustBeWhite = (s: ColorStats) => s.last === "black" && s.streak >= 2;
  if (mustBeBlack(sa) && !mustBeBlack(sb)) return { whiteId: b, blackId: a };
  if (mustBeBlack(sb) && !mustBeBlack(sa)) return { whiteId: a, blackId: b };
  if (mustBeWhite(sa) && !mustBeWhite(sb)) return { whiteId: a, blackId: b };
  if (mustBeWhite(sb) && !mustBeWhite(sa)) return { whiteId: b, blackId: a };

  const balA = sa.white - sa.black;
  const balB = sb.white - sb.black;
  if (balA !== balB) return balA < balB ? { whiteId: a, blackId: b } : { whiteId: b, blackId: a };

  if (sa.last !== sb.last) {
    if (sa.last === "black") return { whiteId: a, blackId: b };
    if (sb.last === "black") return { whiteId: b, blackId: a };
    if (sa.last === null) return { whiteId: a, blackId: b };
    return { whiteId: b, blackId: a };
  }
  return tieBreak() ? { whiteId: a, blackId: b } : { whiteId: b, blackId: a };
}

export function generatePairings(input: PairingInput): PairingOutput {
  const { previousPairs, colorStats, byeHistory, mode } = input;
  const soft = input.softPairs ?? new Set<string>();
  let pool = [...input.players];
  let byeId: string | null = null;

  if (pool.length % 2 === 1) {
    let candidates = pool.filter((p) => !byeHistory.has(p.id));
    if (candidates.length === 0) candidates = pool;
    if (mode === "swiss") {
      candidates = [...candidates].sort((a, b) => a.score - b.score || a.rating - b.rating);
      byeId = candidates[0].id;
    } else {
      byeId = candidates[Math.floor(Math.random() * candidates.length)].id;
    }
    pool = pool.filter((p) => p.id !== byeId);
  }

  let best: [PairingCandidate, PairingCandidate][] = [];
  let bestCost = Number.POSITIVE_INFINITY;
  if (mode === "swiss") {
    ({ pairs: best, cost: bestCost } = swissPair(pool, previousPairs, soft));
  } else {
    // Random: many shuffled greedy tries, keep the one with the fewest rematches.
    const attempts = Math.min(500, 60 + pool.length * 25);
    for (let i = 0; i < attempts; i++) {
      const { pairs, cost } = greedyPair(shuffle(pool), previousPairs, soft);
      if (cost < bestCost) {
        best = pairs;
        bestCost = cost;
        if (cost === 0) break;
      }
    }
  }

  const pairs = best.map(([a, b]) => assignColors(a.id, b.id, colorStats));
  return { pairs, byeId, rematches: pool.length ? Math.floor(bestCost / HARD) : 0 };
}

/**
 * Berger (circle method) round-robin schedule. Odd player counts get a bye
 * each round. Colors are balanced greedily across rounds.
 */
export function roundRobinSchedule(ids: string[]): { pairs: { whiteId: string; blackId: string }[]; byeId: string | null }[] {
  const BYE = "__bye__";
  const list = ids.length % 2 === 1 ? [...ids, BYE] : [...ids];
  const n = list.length;
  const roundsCount = n - 1;
  const rounds: { pairs: { whiteId: string; blackId: string }[]; byeId: string | null }[] = [];
  const stats = new Map<string, ColorStats>();
  const bump = (id: string, color: "white" | "black") => {
    const s = { ...(stats.get(id) ?? EMPTY_COLOR) };
    s[color] += 1;
    s.streak = s.last === color ? s.streak + 1 : 1;
    s.last = color;
    stats.set(id, s);
  };

  const rot = [...list];
  for (let r = 0; r < roundsCount; r++) {
    const pairs: { whiteId: string; blackId: string }[] = [];
    let byeId: string | null = null;
    for (let i = 0; i < n / 2; i++) {
      const a = rot[i];
      const b = rot[n - 1 - i];
      if (a === BYE || b === BYE) {
        byeId = a === BYE ? b : a;
        continue;
      }
      // Deterministic tie-break (round parity) so the schedule is reproducible and colors provably balance.
      const p = assignColors(a, b, stats, () => (r + i) % 2 === 0);
      pairs.push(p);
      bump(p.whiteId, "white");
      bump(p.blackId, "black");
    }
    rounds.push({ pairs, byeId });
    // rotate all but the first element
    const fixed = rot[0];
    const rest = rot.slice(1);
    rest.unshift(rest.pop()!);
    rot.splice(0, n, fixed, ...rest);
  }
  return rounds;
}

/**
 * Standard bracket seeding order for a bracket of `size` (power of two):
 * seed 1 meets seed `size`, 2 meets size-1, and the halves are arranged so
 * that 1 and 2 can only meet in the final. Returns consecutive pairs of seeds.
 */
export function bracketSeedOrder(size: number): number[] {
  let order = [1];
  while (order.length < size) {
    const n = order.length * 2;
    const next: number[] = [];
    for (const s of order) next.push(s, n + 1 - s);
    order = next;
  }
  return order;
}

export function nextPowerOfTwo(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return Math.max(2, p);
}
