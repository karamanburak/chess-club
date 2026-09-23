import Link from "next/link";
import { Icon } from "@/components/icons";
import { notFound } from "next/navigation";
import { readDb } from "@/lib/db";
import { currentPlayerId, isAdmin } from "@/lib/auth";
import { getT } from "@/lib/lang";
import { fmt, plural, type Dict } from "@/lib/i18n";
import { AutoRefresh } from "@/components/AutoRefresh";
import {
  deleteLastRound,
  deleteTournament,
  generateNextRound,
  setParticipants,
  setTournamentStatus,
  toggleWithdraw,
  updateRoundPairings,
  updateTournament,
} from "@/lib/actions";
import {
  crosstable,
  formatDate,
  knockoutPlacement,
  knockoutRoundName,
  knockoutRounds,
  leaderboard,
  matchState,
  playerMap,
  resultLabel,
  roundComplete,
  roundHasResults,
  standings,
  tiebreakPresets,
} from "@/lib/queries";
import { Bracket, type BracketRound } from "@/components/Bracket";
import { PairingReveal, type Seat } from "@/components/PairingReveal";
import { ResultButtons } from "@/components/ResultButtons";
import { SubmitButton } from "@/components/SubmitButton";
import { ConfirmButton } from "@/components/ConfirmButton";
import { Crosstable } from "@/components/Crosstable";
import { GuestNotice } from "@/components/GuestNotice";
import {
  Avatar,
  ColorDot,
  Empty,
  PageHeader,
  Pill,
  PlayerLink,
  Rank,
  RatingDelta,
  Section,
  StatusBadge,
} from "@/components/ui";
import type { Game, Player, Round, Tournament } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function TournamentPage({
  params,
  searchParams,
}: PageProps<"/tournaments/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const editRound = typeof sp.edit === "string" ? Number(sp.edit) : null;
  const view = sp.view === "cross" ? "cross" : "standings";
  const { t: msg, lang } = await getT();
  const db = await readDb();
  const admin = await isAdmin();
  const me = await currentPlayerId();
  /** Organising (pairing, finishing, participants, boards) is for members; guests only read. */
  const member = admin || !!me;
  const t = db.tournaments.find((x) => x.id === id);
  if (!t) notFound();

  const names = playerMap(db);
  const games = new Map(db.games.map((g) => [g.id, g]));
  const table = standings(db, t);
  const cross = crosstable(db, t);
  const last = t.rounds[t.rounds.length - 1] ?? null;
  const lastComplete = last ? roundComplete(db, t, last.number) : true;
  // One-time reveal right after a round was generated (generateNextRound redirects with ?reveal=<round>).
  // Only a random draw gets the "live draw" treatment; computed pairings (Swiss, round robin, knockout) just appear.
  const reveal = !!last && sp.reveal === String(last.number) && !roundHasResults(db, last);
  const revealMode = t.pairingMode === "random" ? "draw" : "reveal";
  const seat = (id: string): Seat => ({ id, name: names.get(id)?.name ?? "?", avatar: names.get(id)?.avatar ?? id });
  const roundsLeft = t.plannedRounds - t.rounds.length;
  const activeCount = t.participantIds.length - t.withdrawnIds.length;
  const isKO = t.pairingMode === "knockout";
  const canGenerate =
    t.status !== "finished" &&
    lastComplete &&
    roundsLeft > 0 &&
    activeCount >= 2 &&
    !(
      isKO &&
      last &&
      (t.knockout?.matches ?? []).some(
        (m) =>
          m.round === last.number &&
          !m.winnerId &&
          !(m.a && t.withdrawnIds.includes(m.a)) &&
          !(m.b && t.withdrawnIds.includes(m.b)),
      )
    );
  const finished = t.status === "finished";
  const isRR = t.pairingMode === "roundrobin";
  const koTotal = isKO ? knockoutRounds(t) : 0;
  const koMatchesUndecided =
    isKO && last
      ? (t.knockout?.matches ?? []).filter(
          (m) => m.round === last.number && !m.winnerId,
        ).length
      : 0;
  const bracketRounds: BracketRound[] = isKO
    ? Array.from({ length: koTotal }, (_, i) => ({
        number: i + 1,
        name: knockoutRoundName(i + 1, koTotal, msg.tournaments.rounds),
        matches: (t.knockout?.matches ?? [])
          .filter((m) => m.round === i + 1)
          .sort(
            (x, y) =>
              Number(x.thirdPlace) - Number(y.thirdPlace) || x.slot - y.slot,
          )
          .map((m) => ({ ...m, state: matchState(db, m) })),
      }))
    : [];
  const placement = isKO ? knockoutPlacement(db, t, msg.tournaments) : [];
  const roundTitle = (n: number) =>
    isKO ? knockoutRoundName(n, koTotal, msg.tournaments.rounds) : fmt(msg.common.roundN, { n });
  // Button labels: "Advance to semifinals" / "Pair round 3".
  const nextRoundLabel = (template: string, roundTemplate: string) =>
    isKO
      ? fmt(template, { round: knockoutRoundName(t.rounds.length + 1, koTotal, msg.tournaments.roundsInSentence) })
      : fmt(roundTemplate, { n: t.rounds.length + 1 });
  const locked = new Set<string>();
  for (const r of t.rounds) {
    if (r.byePlayerId) locked.add(r.byePlayerId);
    for (const p of r.pairings) {
      locked.add(p.whiteId);
      locked.add(p.blackId);
    }
  }
  const selectable = leaderboard(db, true).filter(
    (p) => p.active || t.participantIds.includes(p.id),
  );
  const tiebreakCols = t.tiebreaks.slice(0, 3);

  return (
    <>
      {t.status === "running" && <AutoRefresh seconds={10} />}
      <PageHeader
        eyebrow={
          <Link href="/tournaments" className="hover:text-fg">
            {msg.tournaments.backToList}
          </Link>
        }
        title={t.name}
        subtitle={
          <>
            <StatusBadge status={t.status} />
            <span>{formatDate(t.date, lang)}</span>
            <span>·</span>
            <span>{msg.tournaments.modes[t.pairingMode].label}</span>
            {t.timeControl && (
              <>
                <span>·</span>
                <span className="font-mono">{t.timeControl}</span>
              </>
            )}
            <span>·</span>
            <span>{t.rated ? msg.common.rated : msg.common.unrated}</span>
            <span>·</span>
            <span>
              {plural(activeCount, msg.common.playersN)}
              {t.withdrawnIds.length > 0 &&
                ` ${fmt(msg.tournaments.withdrawnN, { n: t.withdrawnIds.length })}`}
            </span>
          </>
        }
        actions={
          <>
            {t.status === "running" && (
              <Link href="/tv" target="_blank" className="btn" title={msg.common.tvHint}>
                <Icon name="tv" className="h-4 w-4" /> {msg.common.tv}
              </Link>
            )}
            {member && !finished && (
              <form action={generateNextRound.bind(null, t.id)}>
                <SubmitButton
                  className="btn btn-primary"
                  pendingText={msg.common.pairing}
                  disabled={!canGenerate}
                  title={
                    !lastComplete
                      ? msg.tournaments.enterResultsFirst
                      : roundsLeft <= 0
                        ? msg.tournaments.allPlannedPlayed
                        : undefined
                  }
                >
                  {t.rounds.length === 0
                    ? isKO
                      ? msg.tournaments.startDrawBracket
                      : msg.tournaments.startPairRound1
                    : nextRoundLabel(msg.tournaments.advanceTo, msg.tournaments.pairRound)}
                </SubmitButton>
              </form>
            )}
            {member && t.status === "running" && (
              <form action={setTournamentStatus.bind(null, t.id, "finished")}>
                <SubmitButton
                  className={`btn ${roundsLeft <= 0 && lastComplete ? "btn-primary" : ""}`}
                  title={roundsLeft <= 0 ? msg.tournaments.allRoundsPlayed : msg.tournaments.finishEarly}
                >
                  <Icon name="flag" className="h-4 w-4" /> {msg.tournaments.finish}
                </SubmitButton>
              </form>
            )}
            {member && finished && (
              <form action={setTournamentStatus.bind(null, t.id, "running")}>
                <SubmitButton className="btn">{msg.tournaments.reopen}</SubmitButton>
              </form>
            )}
          </>
        }
      />

      <div className="flex items-center gap-1.5 mb-6 no-print">
        {Array.from({ length: t.plannedRounds }, (_, i) => {
          const n = i + 1;
          const played = n <= t.rounds.length;
          const complete = played && roundComplete(db, t, n);
          const isCurrent = n === t.rounds.length && !complete;
          return (
            <div
              key={n}
              title={fmt(msg.common.roundN, { n })}
              className={`h-2 flex-1 rounded-full ${complete ? "bg-win/80" : isCurrent ? "bg-accent animate-pulse" : played ? "bg-accent" : "bg-panel-2"}`}
            />
          );
        })}
        <span className="text-xs text-muted font-mono ml-2 whitespace-nowrap">
          {fmt(msg.tournaments.roundsProgress, { n: t.rounds.length, total: t.plannedRounds })}
        </span>
      </div>

      {!member && !finished && <GuestNotice className="mb-6" />}

      {finished && isKO && placement.length > 0 && (
        <div className="card mb-6 border-accent/40 bg-gradient-to-r from-accent/10 to-transparent flex flex-wrap items-center gap-6">
          {placement.slice(0, 3).map((r, i) => (
            <div
              key={r.playerId}
              className={`flex items-center gap-3 ${i === 0 ? "" : "opacity-80"}`}
            >
              <span className={i === 0 ? "text-4xl" : "text-2xl"}>
                {["🥇", "🥈", "🥉"][i]}
              </span>
              <div>
                <div className={`font-semibold ${i === 0 ? "text-lg" : ""}`}>
                  <PlayerLink
                    id={r.playerId}
                    name={names.get(r.playerId)?.name ?? "?"}
                  />
                </div>
                <div className="text-xs text-muted">{r.label}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {finished && !isKO && table.length > 0 && (
        <div className="card mb-6 border-accent/40 bg-gradient-to-r from-accent/10 to-transparent flex flex-wrap items-center gap-6">
          {table.slice(0, 3).map((r, i) => (
            <div
              key={r.playerId}
              className={`flex items-center gap-3 ${i === 0 ? "" : "opacity-80"}`}
            >
              <span className={i === 0 ? "text-4xl" : "text-2xl"}>
                {["🥇", "🥈", "🥉"][i]}
              </span>
              <div>
                <div className={`font-semibold ${i === 0 ? "text-lg" : ""}`}>
                  <PlayerLink id={r.playerId} name={r.name} />
                </div>
                <div className="text-xs text-muted font-mono">
                  {fmt(msg.common.pointsN, { n: r.points })}
                  {r.performance !== null && ` · ${fmt(msg.tournaments.perfN, { n: r.performance })}`}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {isKO && (
        <div className="mb-6">
          <Section title={msg.tournaments.bracket} flush>
            <div className="p-4">
              <Bracket
                rounds={bracketRounds}
                names={names}
                currentRound={t.rounds.length}
                msg={msg}
              />
            </div>
          </Section>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="col-stack gap-4">
          {t.rounds.length === 0 && (
            <div className="card">
              <Empty icon="rook" title={msg.tournaments.readyTitle}>
                {msg.tournaments.readyBefore}{" "}
                <strong className="text-fg">{msg.tournaments.readyStart}</strong>.{" "}
                {isRR
                  ? msg.tournaments.readyRR
                  : isKO
                    ? fmt(msg.tournaments.readyKO, { n: t.knockout?.bracketSize ?? "" })
                    : msg.tournaments.readyDefault}
              </Empty>
            </div>
          )}

          {last && (
            <Section
              title={
                <>
                  {roundTitle(last.number)}
                  {lastComplete ? (
                    koMatchesUndecided > 0 ? (
                      <Pill tone="accent">
                        {plural(koMatchesUndecided, msg.tournaments.tiebreaksPending)}
                      </Pill>
                    ) : (
                      <Pill tone="win">{msg.common.complete}</Pill>
                    )
                  ) : (
                    <Pill tone="accent">
                      {plural(
                        last.pairings.filter(
                          (p) => !games.get(p.gameId)?.result,
                        ).length,
                        msg.tournaments.boardsPlaying,
                      )}
                    </Pill>
                  )}
                </>
              }
              right={
                !finished ? (
                  <span className="flex items-center gap-2 no-print">
                    {member &&
                      !isKO &&
                      !roundHasResults(db, last) &&
                      editRound !== last.number && (
                        <Link
                          href={`/tournaments/${t.id}?edit=${last.number}`}
                          className="btn btn-sm"
                        >
                          <Icon name="edit" className="h-3.5 w-3.5" /> {msg.tournaments.editBoards}
                        </Link>
                      )}
                    {admin && (
                      <ConfirmButton
                        action={deleteLastRound.bind(null, t.id)}
                        className="btn btn-sm btn-danger"
                        confirmLabel={msg.tournaments.deleteRound}
                      >
                        {msg.tournaments.deleteRound}
                      </ConfirmButton>
                    )}
                  </span>
                ) : undefined
              }
              flush
            >
              {member && editRound === last.number && !roundHasResults(db, last) ? (
                <EditRound t={t} round={last} names={names} msg={msg} />
              ) : (
                <PairingReveal
                  active={reveal}
                  mode={revealMode}
                  boards={last.pairings.filter((p) => p.board > 0).map((p) => ({ board: p.board, white: seat(p.whiteId), black: seat(p.blackId) }))}
                  bye={last.byePlayerId ? seat(last.byePlayerId) : null}
                >
                  <RoundTable
                    round={last}
                    games={games}
                    names={names}
                    finished={finished}
                    ko={t.knockout}
                    me={me}
                    admin={admin}
                    msg={msg}
                  />
                </PairingReveal>
              )}
              {member && lastComplete && canGenerate && (
                <div className="px-5 py-4 border-t border-line flex items-center justify-between gap-3 bg-panel-2/40 no-print">
                  <span className="text-sm text-muted">
                    {msg.tournaments.allResultsIn}
                  </span>
                  <form action={generateNextRound.bind(null, t.id)}>
                    <SubmitButton
                      className="btn btn-primary"
                      pendingText={msg.common.pairing}
                    >
                      {nextRoundLabel(msg.tournaments.advanceToArrow, msg.tournaments.pairRoundArrow)}
                    </SubmitButton>
                  </form>
                </div>
              )}
              {member && lastComplete && roundsLeft <= 0 && t.status === "running" && (
                <div className="px-5 py-4 border-t border-line flex items-center justify-between gap-3 bg-panel-2/40 no-print">
                  <span className="text-sm text-muted">
                    {msg.tournaments.finalRoundComplete}
                  </span>
                  <form
                    action={setTournamentStatus.bind(null, t.id, "finished")}
                  >
                    <SubmitButton className="btn btn-primary">
                      <Icon name="flag" className="h-4 w-4" /> {msg.tournaments.finishTournament}
                    </SubmitButton>
                  </form>
                </div>
              )}
            </Section>
          )}

          {t.rounds.length > 1 && (
            <div className="flex flex-col gap-2">
              <div className="text-[11px] uppercase tracking-wider text-muted px-1 pt-2">
                {msg.tournaments.earlierRounds}
              </div>
              {[...t.rounds]
                .slice(0, -1)
                .reverse()
                .map((round) => (
                  <details
                    key={round.number}
                    className="card p-0 overflow-hidden group"
                  >
                    <summary className="px-5 py-3.5 cursor-pointer flex items-center justify-between gap-3 list-none hover:bg-panel-2/40">
                      <span className="font-medium">
                        {roundTitle(round.number)}
                      </span>
                      <span className="text-xs text-muted flex items-center gap-3">
                        {plural(round.pairings.length, msg.common.boardsN)}
                        <span className="transition-transform group-open:rotate-180">
                          ▾
                        </span>
                      </span>
                    </summary>
                    <div className="border-t border-line">
                      <RoundTable
                        round={round}
                        games={games}
                        names={names}
                        finished={finished}
                        ko={t.knockout}
                        me={me}
                        admin={admin}
                        msg={msg}
                      />
                    </div>
                  </details>
                ))}
            </div>
          )}
        </div>

        <div className="col-stack">
          {isKO && placement.length > 0 && t.rounds.length > 0 && (
            <Section title={msg.tournaments.placement} flush>
              <table className="table [&_th]:px-2 [&_td]:px-2">
                <thead>
                  <tr>
                    <th className="w-10 text-center">#</th>
                    <th>{msg.common.player}</th>
                    <th>{msg.tournaments.status}</th>
                    <th className="text-right">{msg.tournaments.matchWins}</th>
                  </tr>
                </thead>
                <tbody>
                  {placement.map((r) => (
                    <tr key={r.playerId}>
                      <td className="text-center">
                        {finished && r.place <= 3 ? (
                          <Rank n={r.place} />
                        ) : (
                          <span className="font-mono text-muted">
                            {r.place}
                          </span>
                        )}
                      </td>
                      <td>
                        <PlayerLink
                          id={r.playerId}
                          name={names.get(r.playerId)?.name ?? "?"}
                          avatar
                          className="font-medium"
                        />
                      </td>
                      <td className="text-xs text-muted">{r.label}</td>
                      <td className="text-right font-mono">{r.wins}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}

          {!isKO && (
            <Section
              title={view === "cross" ? msg.tournaments.crosstable : msg.tournaments.standings}
              flush
              right={
                t.rounds.length > 0 ? (
                  <span className="inline-flex rounded-lg border border-line overflow-hidden text-xs no-print">
                    <Link
                      href={`/tournaments/${t.id}`}
                      className={`px-2.5 py-1 ${view === "standings" ? "bg-panel-2 text-fg" : "text-muted hover:text-fg"}`}
                    >
                      {msg.tournaments.table}
                    </Link>
                    <Link
                      href={`/tournaments/${t.id}?view=cross`}
                      className={`px-2.5 py-1 border-l border-line ${view === "cross" ? "bg-panel-2 text-fg" : "text-muted hover:text-fg"}`}
                    >
                      {msg.tournaments.crosstable}
                    </Link>
                  </span>
                ) : undefined
              }
            >
              {table.length === 0 ? (
                <Empty icon="pawn" title={msg.tournaments.noParticipants} />
              ) : view === "cross" ? (
                <Crosstable rows={table} table={cross} msg={msg} />
              ) : (
                <div className="scroll-x">
                  <table className="table">
                    <thead>
                      <tr>
                        <th className="w-10 text-center">#</th>
                        <th>{msg.common.player}</th>
                        <th className="text-right">{msg.common.points}</th>
                        {tiebreakCols.map((k, i) => (
                          <th
                            key={k}
                            className={`text-right ${i >= 2 ? "hidden lg:table-cell" : ""}`}
                            title={`${msg.tournaments.tiebreaks[k].label}: ${msg.tournaments.tiebreaks[k].help}`}
                          >
                            {msg.tournaments.tiebreaks[k].short}
                          </th>
                        ))}
                        <th
                          className="text-right hidden xl:table-cell"
                          title={msg.tournaments.perfTitle}
                        >
                          {msg.tournaments.perfShort}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {table.map((r, i) => (
                        <tr
                          key={r.playerId}
                          className={
                            i === 0 && t.rounds.length > 0
                              ? "bg-accent/[0.04]"
                              : ""
                          }
                        >
                          <td className="text-center">
                            {t.rounds.length ? (
                              <Rank n={i + 1} />
                            ) : (
                              <span className="text-muted">–</span>
                            )}
                          </td>
                          <td>
                            <span className="flex items-center gap-2">
                              <Avatar id={r.playerId} name={r.name} size="xs" />
                              <PlayerLink
                                id={r.playerId}
                                name={r.name}
                                className={
                                  r.withdrawn
                                    ? "line-through text-muted"
                                    : "font-medium"
                                }
                              />
                              <span className="text-xs text-muted font-mono">
                                {r.rating}
                              </span>
                              {r.byes > 0 && (
                                <span className="text-[10px] text-muted">
                                  {msg.common.bye}
                                </span>
                              )}
                            </span>
                          </td>
                          <td className="text-right font-mono text-accent font-medium">
                            {r.points}
                          </td>
                          {tiebreakCols.map((k, i) => (
                            <td
                              key={k}
                              className={`text-right font-mono text-muted text-xs ${i >= 2 ? "hidden lg:table-cell" : ""}`}
                            >
                              {k === "buchholz"
                                ? r.buchholz
                                : k === "sonneborn"
                                  ? r.sonneborn
                                  : k === "direct"
                                    ? r.direct
                                    : k === "progressive"
                                      ? r.progressive
                                      : k === "wins"
                                        ? r.wins
                                        : r.blackWins}
                            </td>
                          ))}
                          <td className="text-right font-mono text-muted text-xs hidden xl:table-cell">
                            {r.performance ?? "–"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>
          )}

          {!finished && (
            <Section
              title={msg.tournaments.participants}
              right={
                <span className="text-xs text-muted">
                  {fmt(msg.tournaments.selectedN, { n: t.participantIds.length })}
                </span>
              }
            >
              {(isRR || isKO) && t.rounds.length > 0 ? (
                <>
                  <p className="text-xs text-muted -mt-2 mb-3">
                    {isRR ? msg.tournaments.fixedRR : msg.tournaments.fixedKO}
                  </p>
                  <ul className="flex flex-col gap-1.5">
                    {t.participantIds.map((pid) => {
                      const withdrawn = t.withdrawnIds.includes(pid);
                      return (
                        <li
                          key={pid}
                          className="flex items-center gap-2 text-sm"
                        >
                          <Avatar
                            id={pid}
                            name={names.get(pid)?.name ?? "?"}
                            size="xs"
                          />
                          <span
                            className={
                              withdrawn ? "line-through text-muted" : ""
                            }
                          >
                            {names.get(pid)?.name}
                          </span>
                          {member && (
                            <form
                              action={toggleWithdraw.bind(null, t.id, pid)}
                              className="ml-auto"
                            >
                              <SubmitButton className="btn btn-sm btn-ghost">
                                {withdrawn ? msg.tournaments.rejoin : msg.tournaments.withdraw}
                              </SubmitButton>
                            </form>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </>
              ) : (
                <>
                  <p className="text-xs text-muted -mt-2 mb-3">
                    {t.rounds.length
                      ? msg.tournaments.participantsHintStarted
                      : msg.tournaments.participantsHintNew}
                  </p>
                  {!member ? (
                    <ul className="flex flex-col gap-1.5 text-sm">
                      {t.participantIds.map((pid) => (
                        <li key={pid} className="flex items-center gap-2">
                          <Avatar id={pid} name={names.get(pid)?.name ?? "?"} size="xs" />
                          <span className={t.withdrawnIds.includes(pid) ? "line-through text-muted" : ""}>{names.get(pid)?.name}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                  <form
                    action={setParticipants.bind(null, t.id)}
                    className="flex flex-col gap-3"
                  >
                    <div className="grid grid-cols-2 gap-1.5 max-h-72 overflow-y-auto pr-1">
                      {selectable.map((p) => {
                        const isLocked = locked.has(p.id);
                        return (
                          <label key={p.id} className="chip">
                            <input
                              type="checkbox"
                              name="participantIds"
                              value={p.id}
                              defaultChecked={t.participantIds.includes(p.id)}
                              disabled={isLocked}
                            />
                            <span
                              className={`truncate ${t.withdrawnIds.includes(p.id) ? "line-through text-muted" : ""}`}
                            >
                              {p.name}
                            </span>
                            <span className="ml-auto text-muted font-mono text-xs">
                              {p.rating}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                    <SubmitButton className="btn" pendingText={msg.common.saving}>
                      {msg.tournaments.saveParticipants}
                    </SubmitButton>
                  </form>
                  )}
                  {member && t.rounds.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-line">
                      <div className="label">{msg.tournaments.withdrawRejoin}</div>
                      <div className="flex flex-wrap gap-1.5">
                        {t.participantIds.map((pid) => {
                          const withdrawn = t.withdrawnIds.includes(pid);
                          return (
                            <form
                              key={pid}
                              action={toggleWithdraw.bind(null, t.id, pid)}
                            >
                              <SubmitButton
                                className={`btn btn-sm ${withdrawn ? "btn-danger" : ""}`}
                                title={
                                  withdrawn
                                    ? msg.tournaments.clickToRejoin
                                    : msg.tournaments.clickToWithdraw
                                }
                              >
                                {withdrawn ? "↩ " : ""}
                                {names.get(pid)?.name}
                              </SubmitButton>
                            </form>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </Section>
          )}

          {admin && (
            <>
              <Section title={msg.tournaments.settings}>
                <form
                  action={updateTournament.bind(null, t.id)}
                  className="flex flex-col gap-3"
                >
                  <div>
                    <label htmlFor="f-tournaments-form-name" className="label">{msg.tournaments.form.name}</label>
                    <input id="f-tournaments-form-name"
                      name="name"
                      defaultValue={t.name}
                      className="w-full"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label htmlFor="f-tournaments-form-date" className="label">{msg.tournaments.form.date}</label>
                      <input id="f-tournaments-form-date"
                        name="date"
                        type="date"
                        defaultValue={t.date}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <label htmlFor="f-tournaments-form-rounds" className="label">{msg.tournaments.form.rounds}</label>
                      <input id="f-tournaments-form-rounds"
                        name="plannedRounds"
                        type="number"
                        min={Math.max(1, t.rounds.length)}
                        max={30}
                        defaultValue={t.plannedRounds}
                        className="w-full"
                        disabled={isRR || isKO}
                      />
                    </div>
                    <div>
                      <label htmlFor="f-tournaments-form-timeControl" className="label">{msg.tournaments.form.timeControl}</label>
                      <input id="f-tournaments-form-timeControl"
                        name="timeControl"
                        defaultValue={t.timeControl}
                        className="w-full"
                        placeholder="5+3"
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="f-tournaments-form-tiebreaks" className="label">{msg.tournaments.form.tiebreaks}</label>
                    <select id="f-tournaments-form-tiebreaks"
                      name="tiebreaks"
                      className="w-full"
                      defaultValue={
                        tiebreakPresets().find(
                          (p) => p.order.join() === t.tiebreaks.join(),
                        )?.key ?? "club"
                      }
                    >
                      {tiebreakPresets(msg.tournaments.tiebreakPresets).map((p) => (
                        <option key={p.key} value={p.key}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {t.status === "planned" && (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label htmlFor="f-tournaments-form-format" className="label">{msg.tournaments.form.format}</label>
                          <select id="f-tournaments-form-format"
                            name="pairingMode"
                            defaultValue={t.pairingMode}
                            className="w-full"
                          >
                            <option value="random">{msg.tournaments.modes.random.label}</option>
                            <option value="swiss">{msg.tournaments.modes.swiss.label}</option>
                            <option value="roundrobin">{msg.tournaments.modes.roundrobin.label}</option>
                            <option value="knockout">{msg.tournaments.modes.knockout.label}</option>
                          </select>
                        </div>
                        <div>
                          <label htmlFor="f-tournaments-form-byeScores" className="label">{msg.tournaments.form.byeScores}</label>
                          <select id="f-tournaments-form-byeScores"
                            name="byePoints"
                            defaultValue={String(t.byePoints)}
                            className="w-full"
                          >
                            <option value="1">{msg.tournaments.form.onePoint}</option>
                            <option value="0.5">{msg.tournaments.form.halfPoint}</option>
                          </select>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="label">
                            {msg.tournaments.form.gamesPerMatch}
                          </label>
                          <select
                            name="gamesPerMatch"
                            defaultValue={String(
                              t.knockout?.gamesPerMatch ?? 1,
                            )}
                            className="w-full"
                          >
                            <option value="1">{msg.tournaments.form.oneGame}</option>
                            <option value="2">{msg.tournaments.form.twoGames}</option>
                          </select>
                        </div>
                        <label className="chip self-end">
                          <input
                            type="checkbox"
                            name="thirdPlace"
                            defaultChecked={t.knockout?.thirdPlace ?? true}
                          />{" "}
                          <span>{msg.tournaments.form.thirdPlace}</span>
                        </label>
                      </div>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          name="rated"
                          defaultChecked={t.rated}
                        />{" "}
                        {msg.tournaments.form.rated}
                      </label>
                    </>
                  )}
                  <SubmitButton className="btn" pendingText={msg.common.saving}>
                    {msg.tournaments.form.saveSettings}
                  </SubmitButton>
                </form>
              </Section>

              <Section title={msg.tournaments.dangerZone}>
                <p className="text-xs text-muted -mt-2 mb-3">
                  {msg.tournaments.dangerHint}
                </p>
                <ConfirmButton
                  action={deleteTournament.bind(null, t.id)}
                  confirmLabel={msg.tournaments.deleteTournament}
                >
                  {msg.tournaments.deleteTournament}
                </ConfirmButton>
              </Section>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function RoundTable({
  round,
  games,
  names,
  finished,
  ko,
  me = null,
  admin = false,
  msg,
}: {
  round: Round;
  games: Map<string, Game>;
  names: Map<string, Player>;
  finished: boolean;
  ko?: Tournament["knockout"];
  /** The device's claimed player: their board is highlighted and only they (or the admin) may enter its result. */
  me?: string | null;
  admin?: boolean;
  msg: Dict;
}) {
  const gameLabel = (gameId: string) => {
    if (!ko) return null;
    const m = ko.matches.find((x) => x.gameIds.includes(gameId));
    if (!m) return null;
    const idx = m.gameIds.indexOf(gameId);
    const parts: string[] = [];
    if (m.thirdPlace) parts.push(msg.tournaments.game.thirdPlace);
    if (idx >= ko.gamesPerMatch)
      parts.push(fmt(msg.tournaments.game.tiebreakN, { n: idx - ko.gamesPerMatch + 1 }));
    else if (ko.gamesPerMatch > 1) parts.push(fmt(msg.tournaments.game.gameN, { n: idx + 1 }));
    return parts.length ? parts.join(" · ") : null;
  };
  const rows = round.pairings.map((p) => {
    const g = games.get(p.gameId);
    const res = g?.result ?? null;
    return {
      p,
      g,
      res,
      whiteWon: res === "1-0" || res === "+/-",
      blackWon: res === "0-1" || res === "-/+",
      wn: names.get(p.whiteId)?.name ?? "?",
      bn: names.get(p.blackId)?.name ?? "?",
      mine: !!me && (p.whiteId === me || p.blackId === me),
      label: gameLabel(p.gameId),
    };
  });
  const result = (r: (typeof rows)[number]) =>
    r.g ? (
      finished ? (
        <span className="font-mono">{resultLabel(r.g.result)}</span>
      ) : admin || r.mine ? (
        <ResultButtons gameId={r.g.id} current={r.g.result} names={{ white: r.wn, black: r.bn }} allowSwap />
      ) : (
        <span className="font-mono" title={msg.common.onlyOwnBoard}>{resultLabel(r.g.result)}</span>
      )
    ) : (
      <span className="text-loss text-xs">{msg.tournaments.game.missing}</span>
    );
  const side = (r: (typeof rows)[number], color: "white" | "black") => {
    const id = color === "white" ? r.p.whiteId : r.p.blackId;
    const won = color === "white" ? r.whiteWon : r.blackWon;
    const lost = color === "white" ? r.blackWon : r.whiteWon;
    return (
      <span className={`flex items-center gap-2 min-w-0 ${lost ? "text-muted" : ""} ${won ? "font-semibold" : ""}`}>
        <ColorDot color={color} />
        <PlayerLink id={id} name={color === "white" ? r.wn : r.bn} rating={(color === "white" ? r.g?.whiteRatingBefore : r.g?.blackRatingBefore) ?? names.get(id)?.rating} />
        <RatingDelta before={(color === "white" ? r.g?.whiteRatingBefore : r.g?.blackRatingBefore) ?? null} after={(color === "white" ? r.g?.whiteRatingAfter : r.g?.blackRatingAfter) ?? null} />
      </span>
    );
  };
  const byeName = round.byePlayerId ? names.get(round.byePlayerId)?.name ?? "?" : null;

  return (
    <>
      {/* Phone: one card per board, result controls on their own full-width row. */}
      <ul className="md:hidden divide-y divide-line/60">
        {rows.map((r) => (
          <li key={r.p.gameId} className={`px-4 py-3 flex flex-col gap-2 ${r.mine ? "bg-accent/10" : r.res ? "" : "bg-accent/[0.03]"}`}>
            <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-muted">
              <span className="font-mono">
                {msg.common.board} {r.p.board}
                {r.label && <span className="ml-2 text-accent font-sans">{r.label}</span>}
              </span>
              {r.mine && <span className="text-accent font-sans">{msg.common.you}</span>}
            </div>
            <div className="flex flex-col gap-1.5 text-sm">
              {side(r, "white")}
              {side(r, "black")}
            </div>
            <div className="pt-1 [&_[role=group]]:flex [&_[role=group]]:w-full [&_[role=group]_button]:flex-1">{result(r)}</div>
          </li>
        ))}
        {round.byePlayerId && (
          <li className="px-4 py-3 flex items-center justify-between text-sm">
            <span className="flex items-center gap-2">
              <span className="h-3 w-3" />
              <PlayerLink id={round.byePlayerId} name={byeName ?? "?"} />
              <span className="text-muted text-xs">{msg.common.bye}</span>
            </span>
            <span className="font-mono text-muted text-xs">{msg.tournaments.game.freePoint}</span>
          </li>
        )}
      </ul>

      {/* Desktop: the classic four-column table. */}
      <div className="hidden md:block scroll-x">
        <table className="table">
          <thead>
            <tr>
              <th className="w-16">{msg.common.board}</th>
              <th>⚪ {msg.common.white}</th>
              <th>⚫ {msg.common.black}</th>
              <th className="w-52">{msg.common.result}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.p.gameId} className={`${r.res ? "" : "bg-accent/[0.03]"} ${r.mine ? "bg-accent/10" : ""}`}>
                <td className="font-mono text-muted">
                  {r.p.board}
                  {r.mine && <span className="block text-[10px] uppercase tracking-wider text-accent font-sans">{msg.common.you}</span>}
                  {r.label && <span className="block text-[10px] uppercase tracking-wider text-accent font-sans whitespace-nowrap">{r.label}</span>}
                </td>
                <td>{side(r, "white")}</td>
                <td>{side(r, "black")}</td>
                <td>{result(r)}</td>
              </tr>
            ))}
            {round.byePlayerId && (
              <tr>
                <td className="font-mono text-muted">–</td>
                <td colSpan={2}>
                  <span className="flex items-center gap-2">
                    <span className="h-3 w-3" />
                    <PlayerLink id={round.byePlayerId} name={byeName ?? "?"} />
                    <span className="text-muted text-xs">{msg.common.bye}</span>
                  </span>
                </td>
                <td className="font-mono text-muted text-xs">{msg.tournaments.game.freePoint}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function EditRound({
  t,
  round,
  names,
  msg,
}: {
  t: Tournament;
  round: Round;
  names: Map<string, Player>;
  msg: Dict;
}) {
  const withdrawn = new Set(t.withdrawnIds);
  const options = t.participantIds.filter((id) => !withdrawn.has(id));
  return (
    <form
      action={updateRoundPairings.bind(null, t.id, round.number)}
      className="p-5 flex flex-col gap-3"
    >
      <p className="text-xs text-muted -mt-1">
        {msg.tournaments.edit.hint}
      </p>
      <div className="grid grid-cols-[3rem_1fr_1fr] gap-2 items-center text-sm">
        <span className="label mb-0">{msg.common.board}</span>
        <span className="label mb-0">⚪ {msg.common.white}</span>
        <span className="label mb-0">⚫ {msg.common.black}</span>
        {round.pairings.map((p, i) => (
          <div key={p.gameId} className="contents">
            <span className="font-mono text-muted">{i + 1}</span>
            <PlayerSelect
              name={`white_${i}`}
              value={p.whiteId}
              options={options}
              names={names}
              emptyLabel={msg.tournaments.edit.empty}
            />
            <PlayerSelect
              name={`black_${i}`}
              value={p.blackId}
              options={options}
              names={names}
              emptyLabel={msg.tournaments.edit.empty}
            />
          </div>
        ))}
        <span className="font-mono text-muted">{msg.common.bye}</span>
        <div className="col-span-2">
          <PlayerSelect
            name="bye"
            value={round.byePlayerId ?? ""}
            options={options}
            names={names}
            emptyLabel={msg.tournaments.edit.empty}
          />
        </div>
      </div>
      <div className="flex gap-2">
        <SubmitButton pendingText={msg.common.saving}>{msg.tournaments.edit.saveBoards}</SubmitButton>
        <Link href={`/tournaments/${t.id}`} className="btn">
          {msg.common.cancel}
        </Link>
      </div>
    </form>
  );
}

function PlayerSelect({
  name,
  value,
  options,
  names,
  emptyLabel,
}: {
  name: string;
  value: string;
  options: string[];
  names: Map<string, Player>;
  emptyLabel: string;
}) {
  return (
    <select name={name} defaultValue={value} className="w-full">
      <option value="">{emptyLabel}</option>
      {options.map((id) => (
        <option key={id} value={id}>
          {names.get(id)?.name}
        </option>
      ))}
    </select>
  );
}
