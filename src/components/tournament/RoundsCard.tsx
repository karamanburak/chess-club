import Link from "next/link";
import type { ReactNode } from "react";
import { ConfirmButton } from "@/components/ConfirmButton";
import { Icon } from "@/components/icons";
import { PairingReveal, type Seat } from "@/components/PairingReveal";
import { SubmitButton } from "@/components/SubmitButton";
import { Empty, Pill, Section } from "@/components/ui";
import { deleteLastRound, generateNextRound, setRoundDeadline, setTournamentStatus } from "@/lib/actions";
import { fmt, plural, type Dict, type Lang } from "@/lib/i18n";
import { formatDate, roundHasResults } from "@/lib/queries";
import { deadlineState } from "@/lib/schedule";
import { nameOf } from "@/lib/score";
import type { Database, Tournament } from "@/lib/types";
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
  lang,
}: {
  lang: Lang;
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
  const tableProps = { games, names, finished, ko: t.knockout, me, admin, msg, t, club: db.settings.club.name, lang };

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
          lang={lang}
          table={<RoundTable round={last} roundTitle={view.roundTitle(last.number)} {...tableProps} />}
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
                  <RoundTable round={round} roundTitle={view.roundTitle(round.number)} {...tableProps} />
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
  lang,
  table,
}: {
  lang: Lang;
  db: Database;
  view: TournamentView;
  editRound: number | null;
  revealRound: string | null;
  member: boolean;
  admin: boolean;
  msg: Dict;
  table: ReactNode;
}) {
  const { t, names, lastComplete, finished, isKO, canGenerate, roundsLeft, playing, koUndecided } = view;
  const last = view.last!;
  const hasResults = roundHasResults(db, last);
  const editing = member && editRound === last.number && !hasResults;
  // One-time reveal right after a round was generated. Only a random draw gets the "live draw"
  // treatment; computed pairings (Swiss, round robin, knockout) just appear.
  const reveal = revealRound === String(last.number) && !hasResults;
  const revealMode = t.pairingMode === "random" ? "draw" : "reveal";
  const seat = (id: string): Seat => ({ id, name: nameOf(names, id), avatar: names.get(id)?.avatar ?? id });
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
      <DeadlineBar tournamentId={t.id} round={last} open={!lastComplete} canEdit={member && !finished} msg={msg} lang={lang} />
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

/**
 * The round's "play by" day for tournaments that run over weeks: a pill once set (red when the day passed and boards
 * are still open), and for members a small form to set, move or remove it. Renders nothing for guests without a deadline.
 */
function DeadlineBar({
  tournamentId,
  round,
  open,
  canEdit,
  msg,
  lang,
}: {
  tournamentId: string;
  round: Tournament["rounds"][number];
  /** Boards still without a result: only then a passed deadline is "overdue". */
  open: boolean;
  canEdit: boolean;
  msg: Dict;
  lang: Lang;
}) {
  const m = msg.tournaments.schedule;
  const due = deadlineState(round);
  if (!due && !canEdit) return null;
  const date = round.deadline ? formatDate(round.deadline, lang) : "";
  const state = open ? due?.state : "open";
  return (
    <div className="px-5 py-2.5 border-b border-line flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted">
      {due &&
        (state === "overdue" ? (
          <Pill tone="loss">{fmt(m.overdue, { date })}</Pill>
        ) : state === "today" ? (
          <Pill tone="accent">{m.playByToday}</Pill>
        ) : (
          <Pill tone={state === "soon" ? "accent" : "muted"}>{fmt(m.playBy, { date })}</Pill>
        ))}
      {canEdit && (
        // Keyed on the stored day, so the form closes once a new one is saved.
        <details key={round.deadline ?? ""} className="group no-print open:basis-full">
          <summary className="cursor-pointer list-none inline-flex items-center gap-1.5 hover:text-accent">
            {!due && <Icon name="clock" className="h-3.5 w-3.5" />}
            <span className="underline underline-offset-2">{due ? msg.common.edit : m.setDeadline}</span>
          </summary>
          <form action={setRoundDeadline.bind(null, tournamentId, round.number)} className="mt-2 flex flex-wrap items-end gap-2 rounded-xl border border-line bg-panel-2/40 p-3">
            <label>
              <span className="label">{m.deadline}</span>
              <input name="deadline" type="date" defaultValue={round.deadline ?? ""} />
            </label>
            <SubmitButton className="btn btn-sm btn-primary" pendingText="…">
              {msg.common.save}
            </SubmitButton>
            <p className="basis-full">{m.deadlineHint}</p>
          </form>
        </details>
      )}
    </div>
  );
}
