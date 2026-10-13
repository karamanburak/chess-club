import type { Game, Player, SessionRound } from "@/lib/types";
import { getT } from "@/lib/lang";
import { nameOf, resultLabel } from "@/lib/score";
import { ColorDot, RatingDelta } from "./ui";

export async function RoundList({ r, games, names }: { r: SessionRound; games: Map<string, Game>; names: Map<string, Player> }) {
  const { t } = await getT();
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
                  <ColorDot color="white" /> {nameOf(names, p.whiteId)}
                  <RatingDelta before={g?.whiteRatingBefore ?? null} after={g?.whiteRatingAfter ?? null} />
                </span>
              </td>
              <td className="font-mono text-center">{resultLabel(g?.result ?? null)}</td>
              <td>
                <span className="flex items-center gap-2">
                  <ColorDot color="black" /> {nameOf(names, p.blackId)}
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
              {nameOf(names, r.byePlayerId)} · {t.common.bye}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

