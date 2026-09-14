import Link from "next/link";
import { Icon } from "@/components/icons";
import { notFound } from "next/navigation";
import { readDb } from "@/lib/db";
import { isAdmin } from "@/lib/auth";
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
  TIEBREAK_LABELS,
  TIEBREAK_PRESETS,
} from "@/lib/queries";
import { Bracket, type BracketRound } from "@/components/Bracket";
import { ResultButtons } from "@/components/ResultButtons";
import { SubmitButton } from "@/components/SubmitButton";
import { ConfirmButton } from "@/components/ConfirmButton";
import { Crosstable } from "@/components/Crosstable";
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

const MODE_LABEL = {
  random: "Random",
  swiss: "Swiss",
  roundrobin: "Round robin",
  knockout: "Knockout",
};

export default async function TournamentPage({
  params,
  searchParams,
}: PageProps<"/tournaments/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const editRound = typeof sp.edit === "string" ? Number(sp.edit) : null;
  const view = sp.view === "cross" ? "cross" : "standings";
  const db = await readDb();
  const admin = await isAdmin();
  const t = db.tournaments.find((x) => x.id === id);
  if (!t) notFound();

  const names = playerMap(db);
  const games = new Map(db.games.map((g) => [g.id, g]));
  const table = standings(db, t);
  const cross = crosstable(db, t);
  const last = t.rounds[t.rounds.length - 1] ?? null;
  const lastComplete = last ? roundComplete(db, t, last.number) : true;
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
        name: knockoutRoundName(i + 1, koTotal),
        matches: (t.knockout?.matches ?? [])
          .filter((m) => m.round === i + 1)
          .sort(
            (x, y) =>
              Number(x.thirdPlace) - Number(y.thirdPlace) || x.slot - y.slot,
          )
          .map((m) => ({ ...m, state: matchState(db, m) })),
      }))
    : [];
  const placement = isKO ? knockoutPlacement(db, t) : [];
  const roundTitle = (n: number) =>
    isKO ? knockoutRoundName(n, koTotal) : `Round ${n}`;
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
      <PageHeader
        eyebrow={
          <Link href="/tournaments" className="hover:text-fg">
            ← Tournaments
          </Link>
        }
        title={t.name}
        subtitle={
          <>
            <StatusBadge status={t.status} />
            <span>{formatDate(t.date)}</span>
            <span>·</span>
            <span>{MODE_LABEL[t.pairingMode]}</span>
            {t.timeControl && (
              <>
                <span>·</span>
                <span className="font-mono">{t.timeControl}</span>
              </>
            )}
            <span>·</span>
            <span>{t.rated ? "rated" : "unrated"}</span>
            <span>·</span>
            <span>
              {activeCount} players
              {t.withdrawnIds.length > 0 &&
                ` (${t.withdrawnIds.length} withdrawn)`}
            </span>
          </>
        }
        actions={
          <>
            {!finished && (
              <form action={generateNextRound.bind(null, t.id)}>
                <SubmitButton
                  className="btn btn-primary"
                  pendingText="Pairing…"
                  disabled={!canGenerate}
                  title={
                    !lastComplete
                      ? "Enter all results of the current round first"
                      : roundsLeft <= 0
                        ? "All planned rounds played"
                        : undefined
                  }
                >
                  {t.rounds.length === 0
                    ? isKO
                      ? "▶ Start · draw bracket"
                      : "▶ Start · pair round 1"
                    : isKO
                      ? `Advance to ${roundTitle(t.rounds.length + 1).toLowerCase()}`
                      : `Pair round ${t.rounds.length + 1}`}
                </SubmitButton>
              </form>
            )}
            {t.status === "running" && (
              <form action={setTournamentStatus.bind(null, t.id, "finished")}>
                <SubmitButton
                  className={`btn ${roundsLeft <= 0 && lastComplete ? "btn-primary" : ""}`}
                  title={roundsLeft <= 0 ? "All rounds played" : "Finish early"}
                >
                  <Icon name="flag" className="h-4 w-4" /> Finish
                </SubmitButton>
              </form>
            )}
            {finished && (
              <form action={setTournamentStatus.bind(null, t.id, "running")}>
                <SubmitButton className="btn">Reopen</SubmitButton>
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
              title={`Round ${n}`}
              className={`h-2 flex-1 rounded-full ${complete ? "bg-win/80" : isCurrent ? "bg-accent animate-pulse" : played ? "bg-accent" : "bg-panel-2"}`}
            />
          );
        })}
        <span className="text-xs text-muted font-mono ml-2 whitespace-nowrap">
          {t.rounds.length}/{t.plannedRounds} rounds
        </span>
      </div>

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
                  {r.points} pts
                  {r.performance !== null && ` · perf ${r.performance}`}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {isKO && (
        <div className="mb-6">
          <Section title="Bracket" flush>
            <div className="p-4">
              <Bracket
                rounds={bracketRounds}
                names={names}
                currentRound={t.rounds.length}
              />
            </div>
          </Section>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="col-stack gap-4">
          {t.rounds.length === 0 && (
            <div className="card">
              <Empty icon="♜" title="Ready to start">
                Check the participants on the right, then press{" "}
                <strong className="text-fg">Start</strong>.{" "}
                {isRR
                  ? "The full round-robin schedule is generated with balanced colors."
                  : isKO
                    ? `A ${t.knockout?.bracketSize ?? ""}-player bracket is seeded by rating; top seeds get a bye when the field is not a power of two.`
                    : "Boards, colors and byes are assigned automatically."}
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
                        {koMatchesUndecided} tiebreak
                        {koMatchesUndecided === 1 ? "" : "s"} pending
                      </Pill>
                    ) : (
                      <Pill tone="win">complete</Pill>
                    )
                  ) : (
                    <Pill tone="accent">
                      {
                        last.pairings.filter(
                          (p) => !games.get(p.gameId)?.result,
                        ).length
                      }{" "}
                      boards playing
                    </Pill>
                  )}
                </>
              }
              right={
                !finished ? (
                  <span className="flex items-center gap-2 no-print">
                    {!isKO &&
                      !roundHasResults(db, last) &&
                      editRound !== last.number && (
                        <Link
                          href={`/tournaments/${t.id}?edit=${last.number}`}
                          className="btn btn-sm"
                        >
                          <Icon name="edit" className="h-3.5 w-3.5" /> Edit boards
                        </Link>
                      )}
                    {admin && (
                      <ConfirmButton
                        action={deleteLastRound.bind(null, t.id)}
                        className="btn btn-sm btn-danger"
                        confirmLabel="Delete round"
                      >
                        Delete round
                      </ConfirmButton>
                    )}
                  </span>
                ) : undefined
              }
              flush
            >
              {editRound === last.number && !roundHasResults(db, last) ? (
                <EditRound t={t} round={last} names={names} />
              ) : (
                <RoundTable
                  round={last}
                  games={games}
                  names={names}
                  finished={finished}
                  ko={t.knockout}
                />
              )}
              {lastComplete && canGenerate && (
                <div className="px-5 py-4 border-t border-line flex items-center justify-between gap-3 bg-panel-2/40 no-print">
                  <span className="text-sm text-muted">
                    All results are in.
                  </span>
                  <form action={generateNextRound.bind(null, t.id)}>
                    <SubmitButton
                      className="btn btn-primary"
                      pendingText="Pairing…"
                    >
                      {isKO
                        ? `Advance to ${roundTitle(t.rounds.length + 1).toLowerCase()} →`
                        : `Pair round ${t.rounds.length + 1} →`}
                    </SubmitButton>
                  </form>
                </div>
              )}
              {lastComplete && roundsLeft <= 0 && t.status === "running" && (
                <div className="px-5 py-4 border-t border-line flex items-center justify-between gap-3 bg-panel-2/40 no-print">
                  <span className="text-sm text-muted">
                    Final round complete.
                  </span>
                  <form
                    action={setTournamentStatus.bind(null, t.id, "finished")}
                  >
                    <SubmitButton className="btn btn-primary">
                      <Icon name="flag" className="h-4 w-4" /> Finish tournament
                    </SubmitButton>
                  </form>
                </div>
              )}
            </Section>
          )}

          {t.rounds.length > 1 && (
            <div className="flex flex-col gap-2">
              <div className="text-[11px] uppercase tracking-wider text-muted px-1 pt-2">
                Earlier rounds
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
                        {round.pairings.length} boards
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
                      />
                    </div>
                  </details>
                ))}
            </div>
          )}
        </div>

        <div className="col-stack">
          {isKO && placement.length > 0 && t.rounds.length > 0 && (
            <Section title="Placement" flush>
              <table className="table">
                <thead>
                  <tr>
                    <th className="w-10 text-center">#</th>
                    <th>Player</th>
                    <th>Status</th>
                    <th className="text-right">Match wins</th>
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
              title={view === "cross" ? "Crosstable" : "Standings"}
              flush
              right={
                t.rounds.length > 0 ? (
                  <span className="inline-flex rounded-lg border border-line overflow-hidden text-xs no-print">
                    <Link
                      href={`/tournaments/${t.id}`}
                      className={`px-2.5 py-1 ${view === "standings" ? "bg-panel-2 text-fg" : "text-muted hover:text-fg"}`}
                    >
                      Table
                    </Link>
                    <Link
                      href={`/tournaments/${t.id}?view=cross`}
                      className={`px-2.5 py-1 border-l border-line ${view === "cross" ? "bg-panel-2 text-fg" : "text-muted hover:text-fg"}`}
                    >
                      Crosstable
                    </Link>
                  </span>
                ) : undefined
              }
            >
              {table.length === 0 ? (
                <Empty icon="♟" title="No participants" />
              ) : view === "cross" ? (
                <Crosstable rows={table} table={cross} />
              ) : (
                <div className="scroll-x">
                  <table className="table">
                    <thead>
                      <tr>
                        <th className="w-10 text-center">#</th>
                        <th>Player</th>
                        <th className="text-right">Pts</th>
                        {tiebreakCols.map((k) => (
                          <th
                            key={k}
                            className="text-right"
                            title={`${TIEBREAK_LABELS[k].label}: ${TIEBREAK_LABELS[k].help}`}
                          >
                            {TIEBREAK_LABELS[k].short}
                          </th>
                        ))}
                        <th
                          className="text-right hidden sm:table-cell"
                          title="Performance rating in this tournament"
                        >
                          Perf
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
                                  bye
                                </span>
                              )}
                            </span>
                          </td>
                          <td className="text-right font-mono text-accent font-medium">
                            {r.points}
                          </td>
                          {tiebreakCols.map((k) => (
                            <td
                              key={k}
                              className="text-right font-mono text-muted text-xs"
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
                          <td className="text-right font-mono text-muted text-xs hidden sm:table-cell">
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
              title="Participants"
              right={
                <span className="text-xs text-muted">
                  {t.participantIds.length} selected
                </span>
              }
            >
              {(isRR || isKO) && t.rounds.length > 0 ? (
                <>
                  <p className="text-xs text-muted -mt-2 mb-3">
                    {isRR
                      ? "Round robin: the field is fixed. A player who leaves can be withdrawn; their remaining games are scored as forfeits."
                      : "Knockout: the bracket is fixed. A withdrawn player hands the match to their opponent."}
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
                          <form
                            action={toggleWithdraw.bind(null, t.id, pid)}
                            className="ml-auto"
                          >
                            <SubmitButton className="btn btn-sm btn-ghost">
                              {withdrawn ? "Rejoin" : "Withdraw"}
                            </SubmitButton>
                          </form>
                        </li>
                      );
                    })}
                  </ul>
                </>
              ) : (
                <>
                  <p className="text-xs text-muted -mt-2 mb-3">
                    {t.rounds.length
                      ? "Players who already played stay in; withdraw them if they leave. Others can join or leave between rounds."
                      : "Choose who plays."}
                  </p>
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
                    <SubmitButton className="btn" pendingText="Saving…">
                      Save participants
                    </SubmitButton>
                  </form>
                  {t.rounds.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-line">
                      <div className="label">Withdraw / rejoin</div>
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
                                    ? "Click to rejoin"
                                    : "Click to withdraw"
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
              <Section title="Settings">
                <form
                  action={updateTournament.bind(null, t.id)}
                  className="flex flex-col gap-3"
                >
                  <div>
                    <label className="label">Name</label>
                    <input
                      name="name"
                      defaultValue={t.name}
                      className="w-full"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="label">Date</label>
                      <input
                        name="date"
                        type="date"
                        defaultValue={t.date}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <label className="label">Rounds</label>
                      <input
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
                      <label className="label">Time control</label>
                      <input
                        name="timeControl"
                        defaultValue={t.timeControl}
                        className="w-full"
                        placeholder="5+3"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="label">Tiebreaks</label>
                    <select
                      name="tiebreaks"
                      className="w-full"
                      defaultValue={
                        TIEBREAK_PRESETS.find(
                          (p) => p.order.join() === t.tiebreaks.join(),
                        )?.key ?? "club"
                      }
                    >
                      {TIEBREAK_PRESETS.map((p) => (
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
                          <label className="label">Format</label>
                          <select
                            name="pairingMode"
                            defaultValue={t.pairingMode}
                            className="w-full"
                          >
                            <option value="random">Random</option>
                            <option value="swiss">Swiss</option>
                            <option value="roundrobin">Round robin</option>
                            <option value="knockout">Knockout</option>
                          </select>
                        </div>
                        <div>
                          <label className="label">Bye scores</label>
                          <select
                            name="byePoints"
                            defaultValue={String(t.byePoints)}
                            className="w-full"
                          >
                            <option value="1">1 point</option>
                            <option value="0.5">½ point</option>
                          </select>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="label">
                            Knockout: games per match
                          </label>
                          <select
                            name="gamesPerMatch"
                            defaultValue={String(
                              t.knockout?.gamesPerMatch ?? 1,
                            )}
                            className="w-full"
                          >
                            <option value="1">1 game</option>
                            <option value="2">2 games</option>
                          </select>
                        </div>
                        <label className="chip self-end">
                          <input
                            type="checkbox"
                            name="thirdPlace"
                            defaultChecked={t.knockout?.thirdPlace ?? true}
                          />{" "}
                          <span>3rd-place match</span>
                        </label>
                      </div>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          name="rated"
                          defaultChecked={t.rated}
                        />{" "}
                        Rated
                      </label>
                    </>
                  )}
                  <SubmitButton className="btn" pendingText="Saving…">
                    Save settings
                  </SubmitButton>
                </form>
              </Section>

              <Section title="Danger zone">
                <p className="text-xs text-muted -mt-2 mb-3">
                  Removes the tournament and all its games. Ratings are
                  recalculated.
                </p>
                <ConfirmButton
                  action={deleteTournament.bind(null, t.id)}
                  confirmLabel="Delete tournament"
                >
                  Delete tournament
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
}: {
  round: Round;
  games: Map<string, Game>;
  names: Map<string, Player>;
  finished: boolean;
  ko?: Tournament["knockout"];
}) {
  const gameLabel = (gameId: string) => {
    if (!ko) return null;
    const m = ko.matches.find((x) => x.gameIds.includes(gameId));
    if (!m) return null;
    const idx = m.gameIds.indexOf(gameId);
    const parts: string[] = [];
    if (m.thirdPlace) parts.push("3rd place");
    if (idx >= ko.gamesPerMatch)
      parts.push(`tiebreak ${idx - ko.gamesPerMatch + 1}`);
    else if (ko.gamesPerMatch > 1) parts.push(`game ${idx + 1}`);
    return parts.length ? parts.join(" · ") : null;
  };
  return (
    <div className="scroll-x">
      <table className="table">
        <thead>
          <tr>
            <th className="w-16">Board</th>
            <th>⚪ White</th>
            <th>⚫ Black</th>
            <th className="w-52">Result</th>
          </tr>
        </thead>
        <tbody>
          {round.pairings.map((p) => {
            const g = games.get(p.gameId);
            const res = g?.result ?? null;
            const whiteWon = res === "1-0" || res === "+/-";
            const blackWon = res === "0-1" || res === "-/+";
            const wn = names.get(p.whiteId)?.name ?? "?";
            const bn = names.get(p.blackId)?.name ?? "?";
            return (
              <tr key={p.gameId} className={res ? "" : "bg-accent/[0.03]"}>
                <td className="font-mono text-muted">
                  {p.board}
                  {gameLabel(p.gameId) && (
                    <span className="block text-[10px] uppercase tracking-wider text-accent font-sans whitespace-nowrap">
                      {gameLabel(p.gameId)}
                    </span>
                  )}
                </td>
                <td>
                  <span
                    className={`flex items-center gap-2 ${blackWon ? "text-muted" : ""} ${whiteWon ? "font-semibold" : ""}`}
                  >
                    <ColorDot color="white" />
                    <PlayerLink
                      id={p.whiteId}
                      name={wn}
                      rating={
                        g?.whiteRatingBefore ?? names.get(p.whiteId)?.rating
                      }
                    />
                    <RatingDelta
                      before={g?.whiteRatingBefore ?? null}
                      after={g?.whiteRatingAfter ?? null}
                    />
                  </span>
                </td>
                <td>
                  <span
                    className={`flex items-center gap-2 ${whiteWon ? "text-muted" : ""} ${blackWon ? "font-semibold" : ""}`}
                  >
                    <ColorDot color="black" />
                    <PlayerLink
                      id={p.blackId}
                      name={bn}
                      rating={
                        g?.blackRatingBefore ?? names.get(p.blackId)?.rating
                      }
                    />
                    <RatingDelta
                      before={g?.blackRatingBefore ?? null}
                      after={g?.blackRatingAfter ?? null}
                    />
                  </span>
                </td>
                <td>
                  {g ? (
                    finished ? (
                      <span className="font-mono">{resultLabel(g.result)}</span>
                    ) : (
                      <ResultButtons
                        gameId={g.id}
                        current={g.result}
                        names={{ white: wn, black: bn }}
                        allowSwap
                      />
                    )
                  ) : (
                    <span className="text-loss text-xs">game missing</span>
                  )}
                </td>
              </tr>
            );
          })}
          {round.byePlayerId && (
            <tr>
              <td className="font-mono text-muted">–</td>
              <td colSpan={2}>
                <span className="flex items-center gap-2">
                  <span className="h-3 w-3" />
                  <PlayerLink
                    id={round.byePlayerId}
                    name={names.get(round.byePlayerId)?.name ?? "?"}
                  />
                  <span className="text-muted text-xs">bye</span>
                </span>
              </td>
              <td className="font-mono text-muted text-xs">free point</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function EditRound({
  t,
  round,
  names,
}: {
  t: Tournament;
  round: Round;
  names: Map<string, Player>;
}) {
  const withdrawn = new Set(t.withdrawnIds);
  const options = t.participantIds.filter((id) => !withdrawn.has(id));
  return (
    <form
      action={updateRoundPairings.bind(null, t.id, round.number)}
      className="p-5 flex flex-col gap-3"
    >
      <p className="text-xs text-muted -mt-1">
        Rearrange who plays whom. Each player may appear once. Leave both sides
        empty to drop a board.
      </p>
      <div className="grid grid-cols-[3rem_1fr_1fr] gap-2 items-center text-sm">
        <span className="label mb-0">Board</span>
        <span className="label mb-0">⚪ White</span>
        <span className="label mb-0">⚫ Black</span>
        {round.pairings.map((p, i) => (
          <div key={p.gameId} className="contents">
            <span className="font-mono text-muted">{i + 1}</span>
            <PlayerSelect
              name={`white_${i}`}
              value={p.whiteId}
              options={options}
              names={names}
            />
            <PlayerSelect
              name={`black_${i}`}
              value={p.blackId}
              options={options}
              names={names}
            />
          </div>
        ))}
        <span className="font-mono text-muted">bye</span>
        <div className="col-span-2">
          <PlayerSelect
            name="bye"
            value={round.byePlayerId ?? ""}
            options={options}
            names={names}
          />
        </div>
      </div>
      <div className="flex gap-2">
        <SubmitButton pendingText="Saving…">Save boards</SubmitButton>
        <Link href={`/tournaments/${t.id}`} className="btn">
          Cancel
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
}: {
  name: string;
  value: string;
  options: string[];
  names: Map<string, Player>;
}) {
  return (
    <select name={name} defaultValue={value} className="w-full">
      <option value="">— empty —</option>
      {options.map((id) => (
        <option key={id} value={id}>
          {names.get(id)?.name}
        </option>
      ))}
    </select>
  );
}
