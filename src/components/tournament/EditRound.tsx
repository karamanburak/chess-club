import Link from "next/link";
import { SubmitButton } from "@/components/SubmitButton";
import { ColorDot } from "@/components/ui";
import { updateRoundPairings } from "@/lib/actions";
import { fmt, type Dict } from "@/lib/i18n";
import { nameOf } from "@/lib/score";
import type { Player, Round, Tournament } from "@/lib/types";

/** Rearrange the boards of a round that has no results yet (`?edit=<round>`). */
export function EditRound({
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
  const select = (name: string, value: string, label: string) => (
    <PlayerSelect
      name={name}
      value={value}
      label={label}
      options={options}
      names={names}
      emptyLabel={msg.tournaments.edit.empty}
    />
  );

  return (
    <form action={updateRoundPairings.bind(null, t.id, round.number)} className="p-5 flex flex-col gap-3">
      <p className="text-xs text-muted -mt-1">{msg.tournaments.edit.hint}</p>
      <div className="grid grid-cols-[3rem_1fr_1fr] gap-2 items-center text-sm">
        <span className="label mb-0">{msg.common.board}</span>
        <span className="label mb-0 inline-flex items-center gap-1.5">
          <ColorDot color="white" /> {msg.common.white}
        </span>
        <span className="label mb-0 inline-flex items-center gap-1.5">
          <ColorDot color="black" /> {msg.common.black}
        </span>
        {round.pairings.map((p, i) => (
          <div key={p.gameId} className="contents">
            <span className="font-mono text-muted">{i + 1}</span>
            {select(
              `white_${i}`,
              p.whiteId,
              fmt(msg.tournaments.edit.boardSide, { n: i + 1, color: msg.common.white }),
            )}
            {select(
              `black_${i}`,
              p.blackId,
              fmt(msg.tournaments.edit.boardSide, { n: i + 1, color: msg.common.black }),
            )}
          </div>
        ))}
        <span className="font-mono text-muted">{msg.common.bye}</span>
        <div className="col-span-2">{select("bye", round.byePlayerId ?? "", msg.common.bye)}</div>
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
  label,
  options,
  names,
  emptyLabel,
}: {
  name: string;
  value: string;
  label: string;
  options: string[];
  names: Map<string, Player>;
  emptyLabel: string;
}) {
  return (
    <select name={name} defaultValue={value} aria-label={label} className="w-full">
      <option value="">{emptyLabel}</option>
      {options.map((id) => (
        <option key={id} value={id}>
          {nameOf(names, id)}
        </option>
      ))}
    </select>
  );
}
