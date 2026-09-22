import type { Database, Player } from "./types";

/**
 * The little a client-side player picker needs to know about a player; never the whole record, it carries
 * the PIN hash. `games` is optional: the merge tool shows it, the challenge form does not need it.
 */
export interface PickablePlayer {
  id: string;
  name: string;
  rating: number;
  /** Avatar seed, so the picker can draw the face client-side. */
  avatar: string;
  games?: number;
}

export function pickable(p: Player, games?: number): PickablePlayer {
  return games === undefined ? { id: p.id, name: p.name, rating: p.rating, avatar: p.avatar } : { id: p.id, name: p.name, rating: p.rating, avatar: p.avatar, games };
}

/** Every player, active or not, with their game count: the merge tool wants to see the empty duplicate. */
export function pickableWithGames(db: Database): PickablePlayer[] {
  const count = new Map<string, number>();
  for (const g of db.games) {
    if (!g.result) continue;
    count.set(g.whiteId, (count.get(g.whiteId) ?? 0) + 1);
    count.set(g.blackId, (count.get(g.blackId) ?? 0) + 1);
  }
  return db.players.map((p) => pickable(p, count.get(p.id) ?? 0));
}
