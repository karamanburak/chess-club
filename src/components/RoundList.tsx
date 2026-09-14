import type { Game, Player, SessionRound } from "@/lib/types";
import { ColorDot, RatingDelta } from "./ui";

export function RoundList({ r, games, names }: { r: SessionRound; games: Map<string, Game>; names: Map<string, Player> }) {
  return (
    <table className="table">
      <tbody>
        {r.pairings.map((p) => {
          const g = games.get(p.gameId);
          return (
            <tr key={p.gameId}>
              <td className="font-mono text-muted w-12">{p.board}</td>
              <td>
                <span className="flex items-center gap-2">
                  <ColorDot color="white" /> {names.get(p.whiteId)?.name}
                  <RatingDelta before={g?.whiteRatingBefore ?? null} after={g?.whiteRatingAfter ?? null} />
                </span>
              </td>
              <td className="font-mono text-center">{g?.result ? (g.result === "1/2-1/2" ? "½–½" : g.result.replace("-", "–")) : "–"}</td>
              <td>
                <span className="flex items-center gap-2">
                  <ColorDot color="black" /> {names.get(p.blackId)?.name}
                  <RatingDelta before={g?.blackRatingBefore ?? null} after={g?.blackRatingAfter ?? null} />
                </span>
              </td>
            </tr>
          );
        })}
        {r.byePlayerId && (
          <tr>
            <td className="font-mono text-muted">–</td>
            <td colSpan={3} className="text-muted text-sm">
              {names.get(r.byePlayerId)?.name} · bye
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

