import Link from "next/link";
import { Icon } from "@/components/icons";
import { SubmitButton } from "@/components/SubmitButton";
import { PageHeader, StatusBadge } from "@/components/ui";
import { generateNextRound, setTournamentStatus } from "@/lib/actions";
import { fmt, plural, type Dict, type Lang } from "@/lib/i18n";
import { formatDate, roundComplete } from "@/lib/queries";
import type { Database } from "@/lib/types";
import type { TournamentView } from "./view";

/** Title, meta line, the organising buttons (members only) and the round progress strip. */
export function TournamentHeader({
  db,
  view,
  member,
  msg,
  lang,
}: {
  db: Database;
  view: TournamentView;
  member: boolean;
  msg: Dict;
  lang: Lang;
}) {
  const { t, finished, isKO, lastComplete, roundsLeft, canGenerate, activeCount } = view;
  const running = t.status === "running";

  return (
    <>
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
              {t.withdrawnIds.length > 0 && ` ${fmt(msg.tournaments.withdrawnN, { n: t.withdrawnIds.length })}`}
            </span>
          </>
        }
        actions={
          <>
            {running && (
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
                    : view.nextRoundLabel(msg.tournaments.advanceTo, msg.tournaments.pairRound)}
                </SubmitButton>
              </form>
            )}
            {member && running && (
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
          const tone = complete ? "bg-win/80" : isCurrent ? "bg-accent animate-pulse" : played ? "bg-accent" : "bg-panel-2";
          return <div key={n} title={fmt(msg.common.roundN, { n })} className={`h-2 flex-1 rounded-full ${tone}`} />;
        })}
        <span className="text-xs text-muted font-mono ml-2 whitespace-nowrap">
          {fmt(msg.tournaments.roundsProgress, { n: t.rounds.length, total: t.plannedRounds })}
        </span>
      </div>
    </>
  );
}
