import type { Database, Game, GameResult, Player, Tournament } from "../types";

export function player(id: string, rating = 1200, extra: Partial<Player> = {}): Player {
  return {
    id,
    name: id.toUpperCase(),
    initialRating: rating,
    rating,
    gamesPlayed: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    avatar: "🦄",
    ...extra,
  };
}

let seq = 0;

export function game(whiteId: string, blackId: string, result: GameResult | null, extra: Partial<Game> = {}): Game {
  seq += 1;
  const at = `2026-01-${String(Math.min(28, seq)).padStart(2, "0")}T12:00:00.000Z`;
  return {
    id: `g${seq}`,
    seq,
    tournamentId: null,
    round: null,
    board: null,
    sessionId: null,
    whiteId,
    blackId,
    result,
    rated: true,
    createdAt: at,
    completedAt: result ? at : null,
    whiteRatingBefore: null,
    blackRatingBefore: null,
    whiteRatingAfter: null,
    blackRatingAfter: null,
    ...extra,
  };
}

export function db(players: Player[], games: Game[] = [], tournaments: Tournament[] = []): Database {
  return {
    version: 2,
    seq,
    players,
    games,
    tournaments,
    sessions: [],
    seasons: [],
    activity: [],
    settings: {
      startRating: 1200,
      byePoints: 1,
      defaultTiebreaks: ["buchholz", "sonneborn", "direct", "wins"],
      club: { name: "Test Club", meets: "", nextNight: "", announcement: "" },
    },
  };
}

export function tournament(participantIds: string[], extra: Partial<Tournament> = {}): Tournament {
  return {
    id: "t1",
    name: "Test Open",
    date: "2026-01-10",
    status: "running",
    pairingMode: "swiss",
    plannedRounds: 3,
    rated: true,
    timeControl: "",
    tiebreaks: ["buchholz", "sonneborn", "direct", "wins"],
    byePoints: 1,
    participantIds,
    withdrawnIds: [],
    rounds: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    ...extra,
  };
}
