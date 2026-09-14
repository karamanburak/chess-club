import Link from "next/link";
import { Icon } from "@/components/icons";
import { readDb } from "@/lib/db";
import { isAdmin } from "@/lib/auth";
import { sessionAddPlayer, sessionClose, sessionDeleteLastRound, sessionNextRound, sessionRemovePlayer, sessionRepair, sessionStart } from "@/lib/actions";
import { activeSession, colorStats, formatDate, formatDateTime, leaderboard, playerMap, roundHasResults, sessionRoundComplete, sessionSummary } from "@/lib/queries";
import { ResultButtons } from "@/components/ResultButtons";
import { SubmitButton } from "@/components/SubmitButton";
import { ConfirmButton } from "@/components/ConfirmButton";
import { Avatar, ColorDot, Empty, PageHeader, Pill, PlayerLink, Rank, RatingDelta, Section } from "@/components/ui";
import type { Game, Player, SessionRound } from "@/lib/types";
import { RoundList } from "@/components/RoundList";

export const dynamic = "force-dynamic";

export default async function PairingPage() {
  const db = await readDb();
  const admin = await isAdmin();
  const players = leaderboard(db);
  const names = playerMap(db);
  const colors = colorStats(db);
  const session = activeSession(db);
  const past = db.sessions.filter((s) => s.closedAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  if (!session) {
    return (
      <>
        <PageHeader eyebrow="Casual play" title="Club night" subtitle={<span>Tick who is here, get random boards with balanced colors, play several rounds, enter results as games finish.</span>} />
        <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
          <Section title="Who is here tonight?" right={<span className="text-xs text-muted">{players.length} active players</span>}>
            {players.length < 2 ? (
              <p className="text-sm text-muted">Add at least two active players first.</p>
            ) : (
              <form action={sessionStart} className="flex flex-col gap-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-[26rem] overflow-y-auto pr-1">
                  {players.map((p) => {
                    const c = colors.get(p.id);
                    return (
                      <label key={p.id} className="chip">
                        <input type="checkbox" name="playerIds" value={p.id} />
                        <Avatar id={p.id} name={p.name} size="xs" />
                        <span className="truncate">{p.name}</span>
                        <span className="ml-auto text-muted font-mono text-xs flex items-center gap-3">
                          {c && (
                            <span className="flex items-center gap-1 opacity-70" title="white / black games so far">
                              <ColorDot color="white" /> {c.white} <ColorDot color="black" /> {c.black}
                            </span>
                          )}
                          <span className="text-accent">{p.rating}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
                <div className="flex flex-col gap-2 text-sm">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="rated" value="on" defaultChecked /> Rated games
                  </label>
                  <input type="hidden" name="rated" value="off" />
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="avoidRematches" defaultChecked /> Prefer opponents who have not met before (all-time)
                  </label>
                </div>
                <SubmitButton className="btn btn-primary btn-lg self-start" pendingText="Pairing…">
                  <Icon name="shuffle" className="h-4 w-4" /> Start club night
                </SubmitButton>
                <p className="text-xs text-muted">Nobody meets the same opponent twice on one evening. Late arrivals can join between rounds or take over a bye.</p>
              </form>
            )}
          </Section>

          <Section title="Past club nights" flush>
            {past.length === 0 ? (
              <Empty icon="♟" title="No club nights yet" />
            ) : (
              <ul className="divide-y divide-line/60">
                {past.slice(0, 12).map((s) => {
                  const summary = sessionSummary(db, s);
                  const gamesCount = db.games.filter((g) => g.sessionId === s.id && g.result).length;
                  return (
                    <li key={s.id}>
                      <Link href={`/pairing/${s.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-panel-2/40">
                        <span>
                          <span className="block font-medium">{formatDate(s.createdAt)}</span>
                          <span className="block text-xs text-muted">
                            {s.presentIds.length} players · {s.rounds.length} rounds · {gamesCount} games
                          </span>
                        </span>
                        {summary[0] && (
                          <span className="text-sm flex items-center gap-2">
                            <span className="text-xs text-muted uppercase tracking-wider">Best</span>
                            <Avatar id={summary[0].playerId} name={names.get(summary[0].playerId)?.name ?? "?"} size="xs" />
                            {names.get(summary[0].playerId)?.name}
                            <span className="font-mono text-accent">{summary[0].points}</span>
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
        </div>
      </>
    );
  }

  const games = new Map(db.games.map((g) => [g.id, g]));
  const round = session.rounds[session.rounds.length - 1];
  const complete = round ? sessionRoundComplete(db, round) : true;
  const done = round ? round.pairings.filter((p) => games.get(p.gameId)?.result).length : 0;
  const total = round?.pairings.length ?? 0;
  const summary = sessionSummary(db, session);
  const absent = players.filter((p) => !session.presentIds.includes(p.id));

  return (
    <>
      <PageHeader
        eyebrow={`Club night · started ${formatDateTime(session.createdAt)}`}
        title={
          <span className="flex items-center gap-3">
            Round {round?.number ?? 1}
            {complete ? <Pill tone="win">complete</Pill> : <Pill tone="accent">{total - done} playing</Pill>}
          </span>
        }
        subtitle={
          <span>
            {session.presentIds.length} present · {session.rounds.length} round{session.rounds.length === 1 ? "" : "s"} · {session.rated ? "rated" : "unrated"}
          </span>
        }
        actions={
          <>
            <form action={sessionNextRound.bind(null, session.id)}>
              <SubmitButton className="btn btn-primary" pendingText="Pairing…" disabled={!complete || session.presentIds.length < 2} title={!complete ? "Finish all boards first" : undefined}>
                <Icon name="shuffle" className="h-4 w-4" /> Pair round {(round?.number ?? 0) + 1}
              </SubmitButton>
            </form>
            <ConfirmButton action={sessionClose.bind(null, session.id)} className="btn" confirmLabel="Close night">
              <Icon name="flag" className="h-4 w-4" /> Close night
            </ConfirmButton>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="col-stack gap-4">
          {round && (
            <>
              <div className="flex items-center justify-between gap-3 px-1 no-print">
                <div className="h-1.5 flex-1 rounded-full bg-panel-2 overflow-hidden">
                  <div className={`h-full ${complete ? "bg-win" : "bg-accent"}`} style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
                </div>
                <span className="text-xs text-muted font-mono">
                  {done}/{total}
                </span>
                <span className="flex items-center gap-2">
                  {!roundHasResults(db, round) && (
                    <form action={sessionRepair.bind(null, session.id)}>
                      <SubmitButton className="btn btn-sm" pendingText="…">
                        <Icon name="refresh" className="h-3.5 w-3.5" /> Re-pair
                      </SubmitButton>
                    </form>
                  )}
                  {admin && (
                    <ConfirmButton action={sessionDeleteLastRound.bind(null, session.id)} className="btn btn-sm btn-danger" confirmLabel="Delete round">
                      Delete round
                    </ConfirmButton>
                  )}
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 content-start col-grow">
                {round.pairings.map((p) => (
                  <BoardCard key={p.gameId} p={p} g={games.get(p.gameId)} names={names} />
                ))}
                {round.byePlayerId && (
                  <div className="card border-dashed flex items-center gap-3 text-muted">
                    <Avatar id={round.byePlayerId} name={names.get(round.byePlayerId)?.name ?? "?"} size="md" />
                    <div className="text-sm">
                      <PlayerLink id={round.byePlayerId} name={names.get(round.byePlayerId)?.name ?? "?"} className="font-medium text-fg" />
                      <div className="text-xs">sits out · a late arrival will be paired here automatically</div>
                    </div>
                  </div>
                )}
              </div>
              {complete && (
                <div className="card bg-panel-2/40 flex items-center justify-between gap-3 no-print">
                  <span className="text-sm text-muted">All boards finished. Everyone still here?</span>
                  <form action={sessionNextRound.bind(null, session.id)}>
                    <SubmitButton className="btn btn-primary" pendingText="Pairing…">
                      Pair round {round.number + 1} →
                    </SubmitButton>
                  </form>
                </div>
              )}
            </>
          )}

          {session.rounds.length > 1 && (
            <div className="flex flex-col gap-2">
              <div className="text-[11px] uppercase tracking-wider text-muted px-1 pt-2">Earlier rounds</div>
              {[...session.rounds]
                .slice(0, -1)
                .reverse()
                .map((r) => (
                  <details key={r.number} className="card p-0 overflow-hidden group">
                    <summary className="px-5 py-3 cursor-pointer flex items-center justify-between gap-3 list-none hover:bg-panel-2/40">
                      <span className="font-medium">Round {r.number}</span>
                      <span className="text-xs text-muted flex items-center gap-3">
                        {r.pairings.length} boards <span className="transition-transform group-open:rotate-180">▾</span>
                      </span>
                    </summary>
                    <div className="border-t border-line">
                      <RoundList r={r} games={games} names={names} />
                    </div>
                  </details>
                ))}
            </div>
          )}
        </div>

        <div className="col-stack">
          <Section title="Tonight" flush>
            <table className="table">
              <thead>
                <tr>
                  <th className="w-10 text-center">#</th>
                  <th>Player</th>
                  <th className="text-right">Pts</th>
                  <th className="text-right hidden sm:table-cell">Games</th>
                  <th className="text-right">Elo Δ</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {summary
                  .filter((r) => session.presentIds.includes(r.playerId) || r.games > 0)
                  .map((r, i) => (
                    <tr key={r.playerId} className={!session.presentIds.includes(r.playerId) ? "opacity-50" : ""}>
                      <td className="text-center">{r.games ? <Rank n={i + 1} /> : <span className="text-muted">–</span>}</td>
                      <td>
                        <PlayerLink id={r.playerId} name={names.get(r.playerId)?.name ?? "?"} avatar className="font-medium" />
                      </td>
                      <td className="text-right font-mono text-accent">{r.points}</td>
                      <td className="text-right font-mono text-muted hidden sm:table-cell">{r.games}</td>
                      <td className={`text-right font-mono text-xs ${r.ratingChange > 0 ? "text-win" : r.ratingChange < 0 ? "text-loss" : "text-muted"}`}>
                        {r.ratingChange > 0 ? "+" : ""}
                        {r.ratingChange}
                      </td>
                      <td className="text-right no-print">
                        {session.presentIds.includes(r.playerId) && (
                          <form action={sessionRemovePlayer.bind(null, session.id, r.playerId)}>
                            <SubmitButton className="btn btn-sm btn-ghost text-muted" title="Left early">
                              ↪
                            </SubmitButton>
                          </form>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </Section>

          <Section title="Late arrival">
            {absent.length === 0 ? (
              <p className="text-sm text-muted">Everyone is here.</p>
            ) : (
              <form action={sessionAddPlayer.bind(null, session.id)} className="flex gap-2">
                <select name="playerId" className="flex-1">
                  {absent.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.rating})
                    </option>
                  ))}
                </select>
                <SubmitButton className="btn" pendingText="…">
                  Join
                </SubmitButton>
              </form>
            )}
            <p className="text-xs text-muted mt-2">{round?.byePlayerId ? `Joins right away against ${names.get(round.byePlayerId)?.name} (bye).` : "Will be paired from the next round."}</p>
          </Section>
        </div>
      </div>
    </>
  );
}

function BoardCard({ p, g, names }: { p: SessionRound["pairings"][number]; g: Game | undefined; names: Map<string, Player> }) {
  const res = g?.result ?? null;
  const w = names.get(p.whiteId);
  const b = names.get(p.blackId);
  const whiteWon = res === "1-0" || res === "+/-";
  const blackWon = res === "0-1" || res === "-/+";
  return (
    <div className={`card flex flex-col gap-3 transition-colors ${res ? "border-win/30" : "border-accent/30"}`}>
      <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-muted">
        <span>Board {p.board}</span>
        {res ? <span className="text-win">✓ done</span> : <span className="text-accent">playing</span>}
      </div>
      <Side color="white" id={p.whiteId} name={w?.name ?? "?"} rating={g?.whiteRatingBefore ?? w?.rating ?? null} before={g?.whiteRatingBefore ?? null} after={g?.whiteRatingAfter ?? null} dim={blackWon} won={whiteWon} />
      <Side color="black" id={p.blackId} name={b?.name ?? "?"} rating={g?.blackRatingBefore ?? b?.rating ?? null} before={g?.blackRatingBefore ?? null} after={g?.blackRatingAfter ?? null} dim={whiteWon} won={blackWon} />
      <div className="pt-1 border-t border-line/60 flex items-center justify-between gap-2">
        <span className="text-xs text-muted">Result</span>
        {g ? <ResultButtons gameId={g.id} current={g.result} names={{ white: w?.name ?? "?", black: b?.name ?? "?" }} allowSwap /> : <span className="text-xs text-muted">recorded</span>}
      </div>
    </div>
  );
}

function Side({ color, id, name, rating, before, after, dim, won }: { color: "white" | "black"; id: string; name: string; rating: number | null; before: number | null; after: number | null; dim: boolean; won: boolean }) {
  return (
    <div className={`flex items-center gap-3 ${dim ? "opacity-50" : ""}`}>
      <ColorDot color={color} size="md" />
      <Avatar id={id} name={name} size="md" />
      <div className="min-w-0 flex-1">
        <PlayerLink id={id} name={name} className={`text-base ${won ? "font-semibold" : "font-medium"}`} />
        <div className="text-xs text-muted font-mono flex items-center gap-1.5">
          {rating}
          <RatingDelta before={before} after={after} />
        </div>
      </div>
      {won && <span className="text-accent text-lg">★</span>}
    </div>
  );
}

