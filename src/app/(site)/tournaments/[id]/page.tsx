import { notFound } from "next/navigation";
import { readDb } from "@/lib/db";
import { currentPlayerId, isAdmin } from "@/lib/auth";
import { getT } from "@/lib/lang";
import { AutoRefresh } from "@/components/AutoRefresh";
import { crosstable, knockoutPlacement, knockoutRoundName, matchState, playerMap, standings } from "@/lib/queries";
import { Bracket, type BracketRound } from "@/components/Bracket";
import { GuestNotice } from "@/components/GuestNotice";
import { Section } from "@/components/ui";
import { tournamentView } from "@/components/tournament/view";
import { TournamentHeader } from "@/components/tournament/TournamentHeader";
import { Podium } from "@/components/tournament/Podium";
import { RoundsCard } from "@/components/tournament/RoundsCard";
import { PlacementCard, StandingsCard } from "@/components/tournament/StandingsCard";
import { ParticipantsCard } from "@/components/tournament/ParticipantsCard";
import { TournamentSettingsCard } from "@/components/tournament/TournamentSettingsCard";

export const dynamic = "force-dynamic";

export default async function TournamentPage({ params, searchParams }: PageProps<"/tournaments/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const editRound = typeof sp.edit === "string" ? Number(sp.edit) : null;
  const revealRound = typeof sp.reveal === "string" ? sp.reveal : null;
  const tableView = sp.view === "cross" ? "cross" : "standings";
  const { t: msg, lang } = await getT();
  const db = await readDb();
  const admin = await isAdmin();
  const me = await currentPlayerId();
  /** Organising (pairing, finishing, participants, boards) is for members; guests only read. */
  const member = admin || !!me;
  const t = db.tournaments.find((x) => x.id === id);
  if (!t) notFound();

  const view = tournamentView(db, t, playerMap(db), msg);
  const { names, isKO, finished } = view;
  const table = standings(db, t);
  const placement = isKO ? knockoutPlacement(db, t, msg.tournaments) : [];
  const gameMap = new Map(db.games.map((g) => [g.id, g]));
  const bracketRounds: BracketRound[] = isKO
    ? Array.from({ length: view.koTotal }, (_, i) => ({
        number: i + 1,
        name: knockoutRoundName(i + 1, view.koTotal, msg.tournaments.rounds),
        matches: (t.knockout?.matches ?? [])
          .filter((m) => m.round === i + 1)
          .sort((x, y) => Number(x.thirdPlace) - Number(y.thirdPlace) || x.slot - y.slot)
          .map((m) => ({ ...m, state: matchState(db, m, gameMap) })),
      }))
    : [];

  return (
    <>
      {t.status === "running" && <AutoRefresh seconds={10} />}
      <TournamentHeader db={db} view={view} member={member} msg={msg} lang={lang} />

      {!member && !finished && <GuestNotice className="mb-6" />}

      {finished && <Podium isKO={isKO} placement={placement} table={table} names={names} msg={msg} />}

      {isKO && (
        <div className="mb-6">
          <Section title={msg.tournaments.bracket} flush>
            <div className="p-4">
              <Bracket rounds={bracketRounds} names={names} currentRound={t.rounds.length} msg={msg} />
            </div>
          </Section>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <RoundsCard
          db={db}
          view={view}
          editRound={editRound}
          revealRound={revealRound}
          me={me}
          admin={admin}
          member={member}
          msg={msg}
        />

        <div className="col-stack">
          {isKO && placement.length > 0 && t.rounds.length > 0 && (
            <PlacementCard placement={placement} names={names} finished={finished} msg={msg} />
          )}
          {!isKO && <StandingsCard t={t} table={table} cross={crosstable(db, t)} view={tableView} msg={msg} />}
          {!finished && <ParticipantsCard db={db} view={view} member={member} admin={admin} me={me} msg={msg} />}
          {admin && <TournamentSettingsCard view={view} msg={msg} />}
        </div>
      </div>
    </>
  );
}
