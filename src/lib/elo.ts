import type { Database, Game, GameResult, Player } from "./types";

export const RESULTS: GameResult[] = ["1-0", "0-1", "1/2-1/2", "+/-", "-/+"];

export function isForfeit(result: GameResult | null): boolean {
  return result === "+/-" || result === "-/+";
}

export function expectedScore(rating: number, opponent: number): number {
  return 1 / (1 + Math.pow(10, (opponent - rating) / 400));
}

/** FIDE-like K factor: new players move fast, strong players move slowly. */
export function kFactor(player: { gamesPlayed: number; rating: number }): number {
  if (player.gamesPlayed < 30) return 40;
  if (player.rating >= 2400) return 10;
  return 20;
}

/** Games before the "P" badge disappears. Only the badge: the K factor above keeps its own 30-game rule. */
export const PROVISIONAL_GAMES = 10;

export function scoreFor(result: GameResult, color: "white" | "black"): number {
  if (result === "1/2-1/2") return 0.5;
  const whiteWins = result === "1-0" || result === "+/-";
  if (whiteWins) return color === "white" ? 1 : 0;
  return color === "white" ? 0 : 1;
}

/** Linear FIDE approximation of a performance rating. */
export function performanceRating(opponentRatings: number[], score: number): number | null {
  if (!opponentRatings.length) return null;
  const avg = opponentRatings.reduce((a, b) => a + b, 0) / opponentRatings.length;
  const pct = score / opponentRatings.length;
  return Math.round(avg + 800 * pct - 400);
}

/** Games that affect rating and W/D/L: completed, both players present, not a forfeit. */
export function countsForRating(g: Game): g is Game & { result: GameResult; completedAt: string } {
  return g.result !== null && g.completedAt !== null && !isForfeit(g.result);
}

/**
 * Replays every completed game in chronological order and rebuilds all
 * player ratings and statistics. This keeps ratings consistent even when
 * a result is edited or a game is deleted.
 */
export function recomputeRatings(db: Database): void {
  const byId = new Map<string, Player>();
  for (const p of db.players) {
    p.rating = p.initialRating;
    p.gamesPlayed = 0;
    p.wins = 0;
    p.draws = 0;
    p.losses = 0;
    byId.set(p.id, p);
  }

  for (const g of db.games) {
    g.whiteRatingBefore = null;
    g.blackRatingBefore = null;
    g.whiteRatingAfter = null;
    g.blackRatingAfter = null;
  }

  const completed = db.games
    .filter(countsForRating)
    .sort((a, b) => a.completedAt.localeCompare(b.completedAt) || a.seq - b.seq);

  for (const g of completed) {
    const white = byId.get(g.whiteId);
    const black = byId.get(g.blackId);
    if (!white || !black) continue;

    g.whiteRatingBefore = white.rating;
    g.blackRatingBefore = black.rating;

    const sw = scoreFor(g.result, "white");
    const sb = 1 - sw;

    if (g.rated) {
      const kw = kFactor(white);
      const kb = kFactor(black);
      const ew = expectedScore(white.rating, black.rating);
      const eb = 1 - ew;
      const newWhite = Math.round(white.rating + kw * (sw - ew));
      const newBlack = Math.round(black.rating + kb * (sb - eb));
      white.rating = newWhite;
      black.rating = newBlack;
    }

    g.whiteRatingAfter = white.rating;
    g.blackRatingAfter = black.rating;

    white.gamesPlayed += 1;
    black.gamesPlayed += 1;
    if (sw === 1) {
      white.wins += 1;
      black.losses += 1;
    } else if (sw === 0) {
      white.losses += 1;
      black.wins += 1;
    } else {
      white.draws += 1;
      black.draws += 1;
    }
  }
}
