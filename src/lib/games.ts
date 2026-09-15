import { newId, nextSeq } from "./db";
import type { Database, Game } from "./types";

/** A fresh, unplayed game with the next sequence number; rating fields are filled by recomputeRatings(). */
export function makeGame(db: Database, fields: Pick<Game, "whiteId" | "blackId" | "rated" | "tournamentId" | "round" | "board" | "sessionId">): Game {
  return {
    id: newId(),
    seq: nextSeq(db),
    result: null,
    createdAt: new Date().toISOString(),
    completedAt: null,
    whiteRatingBefore: null,
    blackRatingBefore: null,
    whiteRatingAfter: null,
    blackRatingAfter: null,
    ...fields,
  };
}
