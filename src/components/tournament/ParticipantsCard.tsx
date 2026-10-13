import { Icon } from "@/components/icons";
import { SubmitButton } from "@/components/SubmitButton";
import { Avatar, Section } from "@/components/ui";
import { setParticipants, toggleWithdraw } from "@/lib/actions";
import { fmt, type Dict } from "@/lib/i18n";
import { leaderboard } from "@/lib/queries";
import { nameOf } from "@/lib/score";
import type { Database } from "@/lib/types";
import type { TournamentView } from "./view";

/**
 * Who plays. Guests get a read-only list. Members pick the field with checkboxes while the format
 * allows it (any format before round 1; open pairing and Swiss between rounds) and, once games
 * exist, withdraw or bring back players in the same list (the admin anyone, a member only themselves).
 */
export function ParticipantsCard({
  db,
  view,
  member,
  admin,
  me,
  msg,
}: {
  db: Database;
  view: TournamentView;
  member: boolean;
  admin: boolean;
  /** The device's claimed player: a member may withdraw or bring back only themselves. */
  me: string | null;
  msg: Dict;
}) {
  const { t, isRR, isKO } = view;
  const started = t.rounds.length > 0;
  const fixed = (isRR || isKO) && started;
  const hint = fixed
    ? isRR
      ? msg.tournaments.fixedRR
      : msg.tournaments.fixedKO
    : started
      ? msg.tournaments.participantsHintStarted
      : msg.tournaments.participantsHintNew;
  const picker = member && !fixed;
  // Guests always see the list; members see it once there is something to withdraw from.
  const list = !member || started;

  return (
    <Section
      title={msg.tournaments.participants}
      right={<span className="text-xs text-muted">{fmt(msg.tournaments.selectedN, { n: t.participantIds.length })}</span>}
    >
      <p className="text-xs text-muted -mt-2 mb-3">{hint}</p>
      {picker && <ParticipantPicker db={db} view={view} msg={msg} />}
      {list && (
        <div className={picker ? "mt-4 pt-4 border-t border-line" : ""}>
          {picker && <div className="label">{msg.tournaments.withdrawRejoin}</div>}
          <ParticipantList view={view} canToggle={(pid) => started && (admin || pid === me)} msg={msg} />
        </div>
      )}
    </Section>
  );
}

function ParticipantList({
  view,
  canToggle,
  msg,
}: {
  view: TournamentView;
  canToggle: (playerId: string) => boolean;
  msg: Dict;
}) {
  const { t, names } = view;
  return (
    <ul className="flex flex-col gap-1.5 text-sm">
      {t.participantIds.map((pid) => {
        const name = nameOf(names, pid);
        const withdrawn = t.withdrawnIds.includes(pid);
        return (
          <li key={pid} className="flex items-center gap-2">
            <Avatar id={pid} name={name} size="xs" />
            <span className={withdrawn ? "line-through text-muted" : ""}>{name}</span>
            {canToggle(pid) && (
              <form action={toggleWithdraw.bind(null, t.id, pid)} className="ml-auto">
                <SubmitButton
                  className={`btn btn-sm ${withdrawn ? "" : "btn-ghost"}`}
                  title={withdrawn ? msg.tournaments.clickToRejoin : msg.tournaments.clickToWithdraw}
                >
                  {withdrawn && <Icon name="refresh" className="h-3.5 w-3.5" />}
                  <span aria-hidden>{withdrawn ? msg.tournaments.rejoin : msg.tournaments.withdraw}</span>
                  {/* Screen readers hear whom the button is for, not ten identical "Withdraw"s. */}
                  <span className="sr-only">
                    {fmt(withdrawn ? msg.tournaments.rejoinName : msg.tournaments.withdrawName, { name })}
                  </span>
                </SubmitButton>
              </form>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function ParticipantPicker({ db, view, msg }: { db: Database; view: TournamentView; msg: Dict }) {
  const { t } = view;
  // Anyone who already has a board or a bye stays in; they can only be withdrawn.
  const locked = new Set<string>();
  for (const r of t.rounds) {
    if (r.byePlayerId) locked.add(r.byePlayerId);
    for (const p of r.pairings) {
      locked.add(p.whiteId);
      locked.add(p.blackId);
    }
  }
  const selectable = leaderboard(db, true).filter((p) => p.active || t.participantIds.includes(p.id));

  return (
    <form action={setParticipants.bind(null, t.id)} className="flex flex-col gap-3">
      <fieldset className="grid grid-cols-2 gap-1.5 max-h-72 overflow-y-auto pr-1">
        <legend className="sr-only">{msg.tournaments.participants}</legend>
        {selectable.map((p) => (
          <label key={p.id} className="chip">
            <input
              type="checkbox"
              name="participantIds"
              value={p.id}
              defaultChecked={t.participantIds.includes(p.id)}
              disabled={locked.has(p.id)}
            />
            <span className={`truncate ${t.withdrawnIds.includes(p.id) ? "line-through text-muted" : ""}`}>{p.name}</span>
            <span className="ml-auto text-muted font-mono text-xs">{p.rating}</span>
          </label>
        ))}
      </fieldset>
      <SubmitButton className="btn" pendingText={msg.common.saving}>
        {msg.tournaments.saveParticipants}
      </SubmitButton>
    </form>
  );
}
