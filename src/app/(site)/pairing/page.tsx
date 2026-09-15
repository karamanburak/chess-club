import Link from "next/link";
import { Icon } from "@/components/icons";
import { readDb } from "@/lib/db";
import { currentPlayerId, isAdmin } from "@/lib/auth";
import { getT } from "@/lib/lang";
import { fmt, plural, type Dict } from "@/lib/i18n";
import { AutoRefresh } from "@/components/AutoRefresh";
import { sessionAddPlayer, sessionClose, sessionDeleteLastRound, sessionNextRound, sessionRemovePlayer, sessionRepair, sessionStart } from "@/lib/actions";
import { activeSession, colorStats, formatDate, formatDateTime, leaderboard, playerMap, roundHasResults, sessionRoundComplete, sessionSummary } from "@/lib/queries";
import { ResultButtons } from "@/components/ResultButtons";
import { SubmitButton } from "@/components/SubmitButton";
import { ConfirmButton } from "@/components/ConfirmButton";
import { Avatar, ColorDot, Empty, PageHeader, Pill, PlayerLink, Rank, RatingDelta, Section } from "@/components/ui";
import type { Game, Player, SessionRound } from "@/lib/types";
import { RoundList } from "@/components/RoundList";
import { PairingReveal, type Seat } from "@/components/PairingReveal";

export const dynamic = "force-dynamic";

export default async function PairingPage({ searchParams }: PageProps<"/pairing">) {
  const sp = await searchParams;
  const { t, lang } = await getT();
  const db = await readDb();
  const admin = await isAdmin();
  const me = await currentPlayerId();
  const players = leaderboard(db);
  const names = playerMap(db);
  const colors = colorStats(db);
  const session = activeSession(db);
  const past = db.sessions.filter((s) => s.closedAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  if (!session) {
    return (
      <>
        <PageHeader eyebrow={t.pairing.casualPlay} title={t.common.clubNight} subtitle={<span>{t.pairing.intro}</span>} />
        <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
          <Section title={t.pairing.whoIsHere} right={<span className="text-xs text-muted">{plural(players.length, t.pairing.activePlayers)}</span>}>
            {players.length < 2 ? (
              <p className="text-sm text-muted">{t.pairing.needTwo}</p>
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
                            <span className="flex items-center gap-1 opacity-70" title={t.pairing.colorsSoFar}>
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
                    <input type="checkbox" name="rated" value="on" defaultChecked /> {t.pairing.ratedGames}
                  </label>
                  <input type="hidden" name="rated" value="off" />
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="avoidRematches" defaultChecked /> {t.pairing.avoidRematches}
                  </label>
                </div>
                <SubmitButton className="btn btn-primary btn-lg self-start" pendingText={t.common.pairing}>
                  <Icon name="shuffle" className="h-4 w-4" /> {t.pairing.startNight}
                </SubmitButton>
                <p className="text-xs text-muted">{t.pairing.startHint}</p>
              </form>
            )}
          </Section>

          <Section title={t.pairing.pastNights} flush>
            {past.length === 0 ? (
              <Empty icon="pawn" title={t.pairing.noNights} />
            ) : (
              <ul className="divide-y divide-line/60">
                {past.slice(0, 12).map((s) => {
                  const summary = sessionSummary(db, s);
                  const gamesCount = db.games.filter((g) => g.sessionId === s.id && g.result).length;
                  return (
                    <li key={s.id}>
                      <Link href={`/pairing/${s.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-panel-2/40">
                        <span>
                          <span className="block font-medium">{formatDate(s.createdAt, lang)}</span>
                          <span className="block text-xs text-muted">
                            {plural(s.presentIds.length, t.common.playersN)} · {plural(s.rounds.length, t.common.roundsN)} · {plural(gamesCount, t.common.gamesN)}
                          </span>
                        </span>
                        {summary[0] && (
                          <span className="text-sm flex items-center gap-2">
                            <span className="text-xs text-muted uppercase tracking-wider">{t.pairing.best}</span>
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
  // Play the draw animation once, right after this round was paired (the action redirects with ?reveal=<round>).
  const reveal = !!round && sp.reveal === String(round.number) && !roundHasResults(db, round);
  const seat = (id: string): Seat => ({ id, name: names.get(id)?.name ?? "?", avatar: names.get(id)?.avatar ?? id });
  const myBoard = me && round ? (round.pairings.find((p) => p.whiteId === me || p.blackId === me) ?? null) : null;
  const myBye = !!me && round?.byePlayerId === me;

  return (
    <>
      <PageHeader
        eyebrow={fmt(t.pairing.startedAt, { time: formatDateTime(session.createdAt, lang) })}
        title={
          <span className="flex items-center gap-3">
            {fmt(t.common.roundN, { n: round?.number ?? 1 })}
            {complete ? <Pill tone="win">{t.common.complete}</Pill> : <Pill tone="accent">{fmt(t.pairing.playingN, { n: total - done })}</Pill>}
          </span>
        }
        subtitle={
          <span>
            {plural(session.presentIds.length, t.pairing.presentN)} · {plural(session.rounds.length, t.common.roundsN)} · {session.rated ? t.common.rated : t.common.unrated}
          </span>
        }
        actions={
          <>
            <form action={sessionNextRound.bind(null, session.id)}>
              <SubmitButton className="btn btn-primary" pendingText={t.common.pairing} disabled={!complete || session.presentIds.length < 2} title={!complete ? t.pairing.finishBoardsFirst : undefined}>
                <Icon name="shuffle" className="h-4 w-4" /> {fmt(t.pairing.pairRound, { n: (round?.number ?? 0) + 1 })}
              </SubmitButton>
            </form>
            <ConfirmButton action={sessionClose.bind(null, session.id)} className="btn" confirmLabel={t.pairing.closeNight}>
              <Icon name="flag" className="h-4 w-4" /> {t.pairing.closeNight}
            </ConfirmButton>
            <Link href="/tv" target="_blank" className="btn" title={t.common.tvHint}>
              <Icon name="tv" className="h-4 w-4" /> {t.common.tv}
            </Link>
          </>
        }
      />

      <AutoRefresh seconds={10} />
      {(myBoard || myBye) && !reveal && (
        <div className="card mb-4 border-accent/50 bg-accent/5 flex items-center gap-3 no-print">
          <Avatar id={me!} name={names.get(me!)?.name ?? "?"} size="md" />
          <div className="text-sm">
            {myBoard ? (
              <>
                <span className="font-medium">{fmt(t.pairing.youOnBoard, { n: myBoard.board })}</span>, {myBoard.whiteId === me ? t.pairing.whiteAgainst : t.pairing.blackAgainst}{" "}
                <span className="font-medium">{names.get(myBoard.whiteId === me ? myBoard.blackId : myBoard.whiteId)?.name ?? "?"}</span>
                {games.get(myBoard.gameId)?.result ? ` · ${t.pairing.finished}` : ""}
              </>
            ) : (
              <span className="font-medium">{t.pairing.youSitOut}</span>
            )}
          </div>
        </div>
      )}
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
                        <Icon name="refresh" className="h-3.5 w-3.5" /> {t.pairing.repair}
                      </SubmitButton>
                    </form>
                  )}
                  {admin && (
                    <ConfirmButton action={sessionDeleteLastRound.bind(null, session.id)} className="btn btn-sm btn-danger" confirmLabel={t.pairing.deleteRound}>
                      {t.pairing.deleteRound}
                    </ConfirmButton>
                  )}
                </span>
              </div>
              <div className="col-grow">
                <PairingReveal
                  active={reveal}
                  mode="draw"
                  boards={round.pairings.map((p) => ({ board: p.board, white: seat(p.whiteId), black: seat(p.blackId) }))}
                  bye={round.byePlayerId ? seat(round.byePlayerId) : null}
                >
                  <div className="grid gap-3 sm:grid-cols-2 content-start">
                    {round.pairings.map((p) => (
                      <BoardCard key={p.gameId} p={p} g={games.get(p.gameId)} names={names} me={me} t={t} />
                    ))}
                    {round.byePlayerId && (
                      <div className="card border-dashed flex items-center gap-3 text-muted">
                        <Avatar id={round.byePlayerId} name={names.get(round.byePlayerId)?.name ?? "?"} size="md" />
                        <div className="text-sm">
                          <PlayerLink id={round.byePlayerId} name={names.get(round.byePlayerId)?.name ?? "?"} className="font-medium text-fg" />
                          <div className="text-xs">{t.pairing.byeCardHint}</div>
                        </div>
                      </div>
                    )}
                  </div>
                </PairingReveal>
              </div>
              {complete && (
                <div className="card bg-panel-2/40 flex items-center justify-between gap-3 no-print">
                  <span className="text-sm text-muted">{t.pairing.allFinished}</span>
                  <form action={sessionNextRound.bind(null, session.id)}>
                    <SubmitButton className="btn btn-primary" pendingText={t.common.pairing}>
                      {fmt(t.pairing.pairRound, { n: round.number + 1 })} →
                    </SubmitButton>
                  </form>
                </div>
              )}
            </>
          )}

          {session.rounds.length > 1 && (
            <div className="flex flex-col gap-2">
              <div className="text-[11px] uppercase tracking-wider text-muted px-1 pt-2">{t.pairing.earlierRounds}</div>
              {[...session.rounds]
                .slice(0, -1)
                .reverse()
                .map((r) => (
                  <details key={r.number} className="card p-0 overflow-hidden group">
                    <summary className="px-5 py-3 cursor-pointer flex items-center justify-between gap-3 list-none hover:bg-panel-2/40">
                      <span className="font-medium">{fmt(t.common.roundN, { n: r.number })}</span>
                      <span className="text-xs text-muted flex items-center gap-3">
                        {plural(r.pairings.length, t.common.boardsN)} <span className="transition-transform group-open:rotate-180">▾</span>
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
          <Section title={t.pairing.tonight} flush>
            <table className="table">
              <thead>
                <tr>
                  <th className="w-10 text-center">#</th>
                  <th>{t.common.player}</th>
                  <th className="text-right">{t.common.points}</th>
                  <th className="text-right hidden sm:table-cell">{t.common.games}</th>
                  <th className="text-right">{t.pairing.eloDelta}</th>
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
                            <SubmitButton className="btn btn-sm btn-ghost text-muted" title={t.pairing.leftEarly}>
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

          <Section title={t.pairing.lateArrival}>
            {absent.length === 0 ? (
              <p className="text-sm text-muted">{t.pairing.everyoneHere}</p>
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
                  {t.pairing.join}
                </SubmitButton>
              </form>
            )}
            <p className="text-xs text-muted mt-2">{round?.byePlayerId ? fmt(t.pairing.joinsAgainstBye, { name: names.get(round.byePlayerId)?.name }) : t.pairing.pairedNextRound}</p>
          </Section>
        </div>
      </div>
    </>
  );
}

function BoardCard({ p, g, names, me, t }: { p: SessionRound["pairings"][number]; g: Game | undefined; names: Map<string, Player>; me: string | null; t: Dict }) {
  const res = g?.result ?? null;
  const w = names.get(p.whiteId);
  const b = names.get(p.blackId);
  const whiteWon = res === "1-0" || res === "+/-";
  const blackWon = res === "0-1" || res === "-/+";
  const mine = !!me && (p.whiteId === me || p.blackId === me);
  return (
    <div className={`card flex flex-col gap-3 transition-colors ${res ? "border-win/30" : "border-accent/30"} ${mine ? "ring-2 ring-accent/50" : ""}`}>
      <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-muted">
        <span>
          {fmt(t.common.boardN, { n: p.board })}
          {mine && <span className="ml-2 badge border-accent/50 text-accent normal-case tracking-normal">{t.common.you}</span>}
        </span>
        {res ? <span className="text-win">✓ {t.common.done}</span> : <span className="text-accent">{t.common.playing}</span>}
      </div>
      <Side color="white" id={p.whiteId} name={w?.name ?? "?"} rating={g?.whiteRatingBefore ?? w?.rating ?? null} before={g?.whiteRatingBefore ?? null} after={g?.whiteRatingAfter ?? null} dim={blackWon} won={whiteWon} />
      <Side color="black" id={p.blackId} name={b?.name ?? "?"} rating={g?.blackRatingBefore ?? b?.rating ?? null} before={g?.blackRatingBefore ?? null} after={g?.blackRatingAfter ?? null} dim={whiteWon} won={blackWon} />
      <div className="pt-1 border-t border-line/60 flex items-center justify-between gap-2">
        <span className="text-xs text-muted">{t.common.result}</span>
        {g ? <ResultButtons gameId={g.id} current={g.result} names={{ white: w?.name ?? "?", black: b?.name ?? "?" }} allowSwap /> : <span className="text-xs text-muted">{t.pairing.recorded}</span>}
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
