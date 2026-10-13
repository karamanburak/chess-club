import Link from "next/link";
import type { ReactNode } from "react";
import { ConfirmButton } from "@/components/ConfirmButton";
import { Icon } from "@/components/icons";
import { PairingReveal, type Seat } from "@/components/PairingReveal";
import { SubmitButton } from "@/components/SubmitButton";
import { Empty, Pill, Section } from "@/components/ui";
import { deleteLastRound, generateNextRound, setTournamentStatus } from "@/lib/actions";
import { fmt, plural, type Dict } from "@/lib/i18n";
import { roundHasResults } from "@/lib/queries";
import { nameOf } from "@/lib/score";
import type { Database } from "@/lib/types";
import { EditRound } from "./EditRound";
import { RoundTable } from "./RoundTable";
import type { TournamentView } from "./view";

/** The left column: "ready to start", the current round (with reveal, edit and next-round bar), then earlier rounds folded. */
export function RoundsCard({
  db,
  view,
  editRound,
  revealRound,
  me,
  admin,
  member,
  msg,
}: {
  db: Database;
  view: TournamentView;
  /** `?edit=<round>` */
  editRound: number | null;
  /** `?reveal=<round>`, set once by generateNextRound. */
  revealRound: string | null;
  me: string | null;
  admin: boolean;
  member: boolean;
  msg: Dict;
}) {
  const { t, names, games, last, finished, isKO, isRR } = view;
  const tableProps = { games, names, finished, ko: t.knockout, me, admin, msg };

  return (
    <div className="col-stack gap-4">
      {t.rounds.length === 0 && (
        <div className="card">
          <Empty icon="rook" title={msg.tournaments.readyTitle}>
            {msg.tournaments.readyBefore} <strong className="text-fg">{msg.tournaments.readyStart}</strong>.{" "}
            {isRR
              ? msg.tournaments.readyRR
              : isKO
                ? fmt(msg.tournaments.readyKO, { n: t.knockout?.bracketSize ?? "" })
                : msg.tournaments.readyDefault}
          </Empty>
        </div>
      )}

      {last && (
        <CurrentRound
          db={db}
          view={view}
          editRound={editRound}
          revealRound={revealRound}
          member={member}
          admin={admin}
          msg={msg}
          table={<RoundTable round={last} {...tableProps} />}
        />
      )}

      {t.rounds.length > 1 && (
        <div className="flex flex-col gap-2">
          <div className="text-[11px] uppercase tracking-wider text-muted px-1 pt-2">{msg.tournaments.earlierRounds}</div>
          {[...t.rounds]
            .slice(0, -1)
            .reverse()
            .map((round) => (
              <details key={round.number} className="card p-0 overflow-hidden group">
                <summary className="px-5 py-3.5 cursor-pointer flex items-center justify-between gap-3 list-none hover:bg-panel-2/40">
                  <span className="font-medium">{view.roundTitle(round.number)}</span>
                  <span className="text-xs text-muted flex items-center gap-3">
                    {plural(round.pairings.length, msg.common.boardsN)}
                    <Icon name="chevron" className="h-4 w-4 transition-transform group-open:rotate-180" />
                  </span>
                </summary>
                <div className="border-t border-line">
                  <RoundTable round={round} {...tableProps} />
                </div>
              </details>
            ))}
        </div>
      )}
    </div>
  );
}

function CurrentRound({
  db,
  view,
  editRound,
  revealRound,
  member,
  admin,
  msg,
  table,
}: {
  db: Database;
  view: TournamentView;
  editRound: number | null;
  revealRound: string | null;
  member: boolean;
  admin: boolean;
  msg: Dict;
  table: ReactNode;
}) {
  const { t, names, games, lastComplete, finished, isKO, canGenerate, roundsLeft } = view;
  const last = view.last!;
  const hasResults = roundHasResults(db, last);
  const editing = member && editRound === last.number && !hasResults;
  // One-time reveal right after a round was generated. Only a random draw gets the "live draw"
  // treatment; computed pairings (Swiss, round robin, knockout) just appear.
  const reveal = revealRound === String(last.number) && !hasResults;
  const revealMode = t.pairingMode === "random" ? "draw" : "reveal";
  const seat = (id: string): Seat => ({ id, name: nameOf(names, id), avatar: names.get(id)?.avatar ?? id });
  const koUndecided = isKO
    ? (t.knockout?.matches ?? []).filter((m) => m.round === last.number && !m.winnerId).length
    : 0;
  const playing = last.pairings.filter((p) => !games.get(p.gameId)?.result).length;

  return (
    <Section
      title={
        <>
          {view.roundTitle(last.number)}
          {!lastComplete ? (
            <Pill tone="accent">{plural(playing, msg.tournaments.boardsPlaying)}</Pill>
          ) : koUndecided > 0 ? (
            <Pill tone="accent">{plural(koUndecided, msg.tournaments.tiebreaksPending)}</Pill>
          ) : (
            <Pill tone="win">{msg.common.complete}</Pill>
          )}
        </>
      }
      right={
        !finished ? (
          <span className="flex items-center gap-2 no-print">
            {member && !isKO && !hasResults && editRound !== last.number && (
              <Link href={`/tournaments/${t.id}?edit=${last.number}`} className="btn btn-sm">
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
      {editing ? (
        <EditRound t={t} round={last} names={names} msg={msg} />
      ) : (
        <PairingReveal
          active={reveal}
          mode={revealMode}
          boards={last.pairings
            .filter((p) => p.board > 0)
            .map((p) => ({ board: p.board, white: seat(p.whiteId), black: seat(p.blackId) }))}
          bye={last.byePlayerId ? seat(last.byePlayerId) : null}
        >
          {table}
        </PairingReveal>
      )}
      {member && lastComplete && canGenerate && (
        <RoundBar text={msg.tournaments.allResultsIn}>
          <form action={generateNextRound.bind(null, t.id)}>
            <SubmitButton className="btn btn-primary" pendingText={msg.common.pairing}>
              {view.nextRoundLabel(msg.tournaments.advanceToArrow, msg.tournaments.pairRoundArrow)}
            </SubmitButton>
          </form>
        </RoundBar>
      )}
      {member && lastComplete && roundsLeft <= 0 && t.status === "running" && (
        <RoundBar text={msg.tournaments.finalRoundComplete}>
          <form action={setTournamentStatus.bind(null, t.id, "finished")}>
            <SubmitButton className="btn btn-primary">
              <Icon name="flag" className="h-4 w-4" /> {msg.tournaments.finishTournament}
            </SubmitButton>
          </form>
        </RoundBar>
      )}
    </Section>
  );
}

function RoundBar({ text, children }: { text: string; children: ReactNode }) {
  return (
    <div className="px-5 py-4 border-t border-line flex items-center justify-between gap-3 bg-panel-2/40 no-print">
      <span className="text-sm text-muted">{text}</span>
      {children}
    </div>
  );
}
