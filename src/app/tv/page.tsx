import Link from "next/link";
import { readDb } from "@/lib/db";
import { getT } from "@/lib/lang";
import { fmt, type Dict } from "@/lib/i18n";
import { currentSeason, daysUntil, seasonTable } from "@/lib/club";
import { activeSession, leaderboard, playerMap, sessionSummary, standings } from "@/lib/queries";
import { AutoRefresh } from "@/components/AutoRefresh";
import { FaceSvg } from "@/components/Face";
import { Icon, KnightMark } from "@/components/icons";
import { QuoteOfTheDay } from "@/components/QuoteOfTheDay";
import type { Database, Game, Player, Round, SessionRound } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * The projector view: no navigation, big type, refreshes itself every few seconds.
 * Shows whatever is happening right now — the club night, else a running tournament,
 * else the leaderboard — so it can stay on all evening.
 */
export default async function TvPage() {
  const { t } = await getT();
  const db = await readDb();
  const club = db.settings.club;
  const names = playerMap(db);
  const games = new Map(db.games.map((g) => [g.id, g]));
  const night = activeSession(db);
  const running = db.tournaments.filter((t) => t.status === "running" && t.rounds.length).sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
  const season = currentSeason(db);
  const next = daysUntil(club.nextNight);

  return (
    <div className="min-h-screen flex flex-col px-8 py-6 gap-6 text-lg">
      <AutoRefresh seconds={5} />
      <header className="flex items-center justify-between gap-6 board-texture rounded-3xl border border-line px-8 py-6">
        <div className="flex items-center gap-5 min-w-0">
          <KnightMark className="h-16 w-16 shrink-0 text-fg" />
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-[0.2em] text-muted">{season ? season.name : t.nav.chessClub}</div>
            <h1 className="font-display text-4xl font-semibold tracking-tight leading-none truncate">{club.name}</h1>
          </div>
        </div>
        <QuoteOfTheDay size="lg" className="hidden xl:block max-w-2xl text-right" />
      </header>

      {night ? (
        <NightView db={db} names={names} games={games} night={night} t={t} />
      ) : running ? (
        <TournamentView db={db} names={names} games={games} tournament={running} t={t} />
      ) : (
        <IdleView db={db} names={names} nextNight={next} t={t} />
      )}

      <footer className="mt-auto flex items-center justify-between text-sm text-muted no-print">
        <span className="flex items-center gap-2">
          <Icon name="tv" className="h-4 w-4" /> {t.tv.live}
        </span>
        <Link href="/" className="hover:text-fg">
          {t.tv.back}
        </Link>
      </footer>
    </div>
  );
}

function NightView({ db, names, games, night, t }: { db: Database; names: Map<string, Player>; games: Map<string, Game>; night: NonNullable<ReturnType<typeof activeSession>>; t: Dict }) {
  const round = night.rounds[night.rounds.length - 1];
  const rows = sessionSummary(db, night)
    .filter((r) => night.presentIds.includes(r.playerId) || r.games > 0)
    .sort((a, b) => b.points - a.points || b.ratingChange - a.ratingChange)
    .slice(0, 12);
  return (
    <div className="grid gap-6 xl:grid-cols-[3fr_2fr] flex-1 min-h-0">
      <section className="flex flex-col gap-4">
        <h2 className="font-display text-3xl font-semibold">
          {fmt(t.common.roundN, { n: round?.number ?? 1 })} <span className="text-muted text-xl font-sans font-normal">· {fmt(t.tv.present, { n: night.presentIds.length })}</span>
        </h2>
        {round ? <Boards round={round} names={names} games={games} sitsOut={t.common.sitsOut} /> : <p className="text-muted">{t.tv.waiting}</p>}
      </section>
      <section className="card p-6 flex flex-col gap-3">
        <h2 className="font-display text-2xl font-semibold">{t.tv.tonight}</h2>
        <table className="table text-lg">
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.playerId}>
                <td className="w-10 font-mono text-muted">{r.games ? i + 1 : "–"}</td>
                <td>
                  <span className="flex items-center gap-3">
                    <FaceSvg seed={names.get(r.playerId)?.avatar ?? r.playerId} className="h-9 w-9 rounded-full" />
                    {names.get(r.playerId)?.name ?? "?"}
                  </span>
                </td>
                <td className="text-right font-mono text-accent">{r.points}</td>
                <td className={`text-right font-mono ${r.ratingChange > 0 ? "text-win" : r.ratingChange < 0 ? "text-loss" : "text-muted"}`}>
                  {r.ratingChange > 0 ? `+${r.ratingChange}` : r.ratingChange || "–"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function TournamentView({ db, names, games, tournament, t }: { db: Database; names: Map<string, Player>; games: Map<string, Game>; tournament: Database["tournaments"][number]; t: Dict }) {
  const round = tournament.rounds[tournament.rounds.length - 1];
  const table = standings(db, tournament).slice(0, 10);
  return (
    <div className="grid gap-6 xl:grid-cols-[3fr_2fr] flex-1 min-h-0">
      <section className="flex flex-col gap-4">
        <h2 className="font-display text-3xl font-semibold">
          {tournament.name} <span className="text-muted text-xl font-sans font-normal">· {fmt(t.common.roundNofTotal, { n: round.number, total: tournament.plannedRounds })}</span>
        </h2>
        <Boards round={round} names={names} games={games} sitsOut={t.common.sitsOut} />
      </section>
      <section className="card p-6 flex flex-col gap-3">
        <h2 className="font-display text-2xl font-semibold">{t.tv.standings}</h2>
        <table className="table text-lg">
          <tbody>
            {table.map((r, i) => (
              <tr key={r.playerId} className={r.withdrawn ? "opacity-50" : ""}>
                <td className="w-10 font-mono text-muted">{i + 1}</td>
                <td>
                  <span className="flex items-center gap-3">
                    <FaceSvg seed={names.get(r.playerId)?.avatar ?? r.playerId} className="h-9 w-9 rounded-full" />
                    {r.name}
                  </span>
                </td>
                <td className="text-right font-mono text-accent">{r.points}</td>
                <td className="text-right font-mono text-muted">{r.buchholz}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function IdleView({ db, names, nextNight, t }: { db: Database; names: Map<string, Player>; nextNight: number | null; t: Dict }) {
  const board = leaderboard(db).slice(0, 10);
  const season = currentSeason(db);
  const table = season ? seasonTable(db, season).slice(0, 5) : [];
  const label = nextNight === null || nextNight < 0 ? null : nextNight === 0 ? t.common.tonight : nextNight === 1 ? t.common.tomorrow : fmt(t.common.inDays, { n: nextNight });
  return (
    <div className="grid gap-6 xl:grid-cols-[3fr_2fr] flex-1 min-h-0">
      <section className="card p-6 flex flex-col gap-3">
        <h2 className="font-display text-3xl font-semibold">{t.tv.leaderboard}</h2>
        <table className="table text-lg">
          <tbody>
            {board.map((p, i) => (
              <tr key={p.id}>
                <td className="w-10 font-mono text-muted">{i + 1}</td>
                <td>
                  <span className="flex items-center gap-3">
                    <FaceSvg seed={p.avatar} className="h-9 w-9 rounded-full" />
                    {p.name}
                  </span>
                </td>
                <td className="text-right font-mono text-accent">{p.rating}</td>
                <td className="text-right font-mono text-muted">{fmt(t.tv.gamesN, { n: p.gamesPlayed })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="flex flex-col gap-6">
        {label && (
          <div className="card p-6 border-accent/40 bg-accent/5 flex items-center gap-4">
            <Icon name="pawn" className="h-8 w-8 text-accent" />
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-muted">{t.tv.nextNight}</div>
              <div className="font-display text-3xl font-semibold">{label}</div>
              {db.settings.club.meets && <div className="text-muted">{db.settings.club.meets}</div>}
            </div>
          </div>
        )}
        {season && table.length > 0 && (
          <section className="card p-6 flex flex-col gap-3">
            <h2 className="font-display text-2xl font-semibold">{season.name}</h2>
            <table className="table text-lg">
              <tbody>
                {table.map((r, i) => (
                  <tr key={r.playerId}>
                    <td className="w-10 font-mono text-muted">{i + 1}</td>
                    <td>{names.get(r.playerId)?.name ?? "?"}</td>
                    <td className="text-right font-mono text-accent">{fmt(t.common.pointsN, { n: r.points })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
        {db.settings.club.announcement && (
          <div className="card p-6 flex items-start gap-3">
            <Icon name="pin" className="h-6 w-6 text-accent shrink-0 mt-1" />
            <p className="text-xl">{db.settings.club.announcement}</p>
          </div>
        )}
      </section>
    </div>
  );
}

function Boards({ round, names, games, sitsOut }: { round: Round | SessionRound; names: Map<string, Player>; games: Map<string, Game>; sitsOut: string }) {
  const label = (r: Game["result"]) => (r === null ? "" : r === "1/2-1/2" ? "½–½" : r.replace("-", "–"));
  return (
    <div className="grid gap-4 md:grid-cols-2 content-start">
      {round.pairings
        .filter((p) => p.board > 0)
        .map((p) => {
          const g = games.get(p.gameId);
          const res = g?.result ?? null;
          const whiteWon = res === "1-0" || res === "+/-";
          const blackWon = res === "0-1" || res === "-/+";
          return (
            <div key={p.gameId} className={`card p-5 flex items-center gap-4 ${res ? "border-win/30" : "border-accent/40"}`}>
              <span className="font-mono text-muted text-xl w-8 shrink-0">{p.board}</span>
              <Side seat={names.get(p.whiteId)} color="white" won={whiteWon} dim={blackWon} />
              <span className={`font-mono text-2xl shrink-0 w-20 text-center ${res ? "text-fg" : "text-muted"}`}>{res ? label(res) : "vs"}</span>
              <Side seat={names.get(p.blackId)} color="black" won={blackWon} dim={whiteWon} align="right" />
            </div>
          );
        })}
      {round.byePlayerId && (
        <div className="card p-5 border-dashed flex items-center gap-4 text-muted">
          <FaceSvg seed={names.get(round.byePlayerId)?.avatar ?? round.byePlayerId} className="h-12 w-12 rounded-full" />
          <span className="text-xl">
            <span className="text-fg font-medium">{names.get(round.byePlayerId)?.name ?? "?"}</span> {sitsOut}
          </span>
        </div>
      )}
    </div>
  );
}

function Side({ seat, color, won, dim, align = "left" }: { seat: Player | undefined; color: "white" | "black"; won: boolean; dim: boolean; align?: "left" | "right" }) {
  return (
    <span className={`flex items-center gap-3 min-w-0 flex-1 ${align === "right" ? "flex-row-reverse text-right" : ""} ${dim ? "opacity-50" : ""}`}>
      <span className="relative shrink-0">
        <FaceSvg seed={seat?.avatar ?? "?"} className="h-12 w-12 rounded-full" />
        <span className={`absolute -bottom-0.5 ${align === "right" ? "-left-0.5" : "-right-0.5"} h-4 w-4 rounded-full border border-line ${color === "white" ? "bg-white" : "bg-black"}`} />
      </span>
      <span className={`truncate text-xl ${won ? "font-semibold" : ""}`}>{seat?.name ?? "?"}</span>
    </span>
  );
}
