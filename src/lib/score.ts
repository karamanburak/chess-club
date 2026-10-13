import type { GameResult } from "./types";

/** "1-0" → "1–0", draws as "½–½", forfeits as "+ / –". Client-safe (no server imports). */
export function resultLabel(result: GameResult | null): string {
  if (!result) return "–";
  if (result === "1/2-1/2") return "½–½";
  if (result === "+/-") return "+ / –";
  if (result === "-/+") return "– / +";
  return result.replace("-", "–");
}

/** The same result read from the other side's point of view ("1–0" → "0–1"). */
export function flippedResultLabel(result: GameResult | null): string {
  if (result === "1-0") return "0–1";
  if (result === "0-1") return "1–0";
  if (result === "+/-") return "– / +";
  if (result === "-/+") return "+ / –";
  return resultLabel(result);
}

/** 3.5 → "3½", 0.5 → "½", 2 → "2". */
export function scoreText(n: number): string {
  const whole = Math.floor(n);
  return n - whole === 0.5 ? (whole ? `${whole}½` : "½") : String(n);
}

/** A display name from a player map; `fallback` covers a reference to a deleted player. */
export function nameOf(players: ReadonlyMap<string, { name: string }>, id: string | null | undefined, fallback = "?"): string {
  return (id && players.get(id)?.name) || fallback;
}
