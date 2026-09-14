import { notFound } from "next/navigation";
import { Icon } from "@/components/icons";
import Link from "next/link";
import { readDb } from "@/lib/db";
import { avatarChoices } from "@/lib/avatar";
import { AvatarPicker } from "@/components/AvatarPicker";
import { achievements, attendance, nextTitle, titleFor } from "@/lib/club";
import { currentPlayerId, isAdmin } from "@/lib/auth";
import { changeOwnPin, deletePlayer, resetPin, unclaimProfile, updatePlayer } from "@/lib/actions";
import { colorStats, formatDateTime, gamesForPlayer, playerMap, rankChanges, ratingHistory, recentForm, resultLabel, rivals, streaks } from "@/lib/queries";
import { isForfeit, scoreFor } from "@/lib/elo";
import { RatingChart } from "@/components/RatingChart";
import { SubmitButton } from "@/components/SubmitButton";
import { ConfirmButton } from "@/components/ConfirmButton";
import { AchievementChip, ColorDot, Empty, FormDots, PageHeader, PlayerLink, Provisional, RankMove, RatingDelta, Section, StreakBadge, TitleBadge } from "@/components/ui";

export const dynamic = "force-dynamic";
const RECENT_GAMES = 20;

export default async function PlayerPage({ params }: PageProps<"/players/[id]">) {
  const { id } = await params;
  const db = await readDb();
  const admin = await isAdmin();
  const player = db.players.find((p) => p.id === id);
  if (!player) notFound();
  const me = await currentPlayerId();
  const isMe = me === player.id;

  const names = playerMap(db);
  const games = gamesForPlayer(db, player.id);
  const history = ratingHistory(db, player);
  const colors = colorStats(db).get(player.id) ?? { white: 0, black: 0, last: null, streak: 0 };
  const tournaments = new Map(db.tournaments.map((t) => [t.id, t]));
  const sessions = new Map(db.sessions.map((s) => [s.id, s]));
  const peak = Math.max(...history.map((h) => h.rating));
  const activeSorted = db.players.filter((p) => p.active).sort((a, b) => b.rating - a.rating);
  const rank = activeSorted.findIndex((p) => p.id === player.id) + 1;
  const pct = player.gamesPlayed ? Math.round(((player.wins + player.draws / 2) / player.gamesPlayed) * 100) : null;
  const st = streaks(db, player.id);
  const rv = rivals(db, player.id);
  const move = rankChanges(db).get(player.id);
  const whiteGames = games.filter((g) => g.whiteId === player.id && !isForfeit(g.result));
  const blackGames = games.filter((g) => g.blackId === player.id && !isForfeit(g.result));
  const whitePct = whiteGames.length ? Math.round((whiteGames.reduce((s, g) => s + scoreFor(g.result!, "white"), 0) / whiteGames.length) * 100) : null;
  const blackPct = blackGames.length ? Math.round((blackGames.reduce((s, g) => s + scoreFor(g.result!, "black"), 0) / blackGames.length) * 100) : null;
  const title = titleFor(player);
  const next = nextTitle(player);
  const badges = achievements(db, player.id);
  const earned = badges.filter((a) => a.earnedAt).sort((a, b) => b.earnedAt!.localeCompare(a.earnedAt!));
  const locked = badges.filter((a) => !a.earnedAt);
  const att = attendance(db, player);

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/players" className="hover:text-fg">
            ← Players
          </Link>
        }
        title={
          <span className="flex items-center gap-3">
            <AvatarPicker playerId={player.id} name={player.name} seed={player.avatar} choices={avatarChoices(player.id, 23)} canEdit={admin || isMe} />
            <span className="flex items-center gap-2 flex-wrap">
              {player.name}
              {isMe && <span className="badge border-accent/40 text-accent">you</span>}
              <TitleBadge title={title} />
              <Provisional games={player.gamesPlayed} />
              <StreakBadge streak={st.current} />
              {!player.active && <span className="badge border-muted/40 text-muted">inactive</span>}
            </span>
          </span>
        }
        subtitle={player.note ? <span>{player.note}</span> : undefined}
        actions={
          rv[0] ? (
            <Link href={`/h2h?a=${player.id}&b=${rv[0].opponentId}`} className="btn">
              <Icon name="swords" className="h-4 w-4" /> vs {names.get(rv[0].opponentId)?.name}
            </Link>
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="stat">
          <span className="stat-label">Elo</span>
          <span className="stat-value text-accent">{player.rating}</span>
          <span className="text-xs text-muted">peak {peak} · started {player.initialRating}</span>
          {next && (
            <span className="text-xs text-muted">
              {next.games > 0 ? `${next.games} more game${next.games === 1 ? "" : "s"} to hold a title` : `${next.missing} to ${next.title.label}`}
            </span>
          )}
        </div>
        <div className="stat">
          <span className="stat-label">Rank</span>
          <span className="stat-value flex items-center gap-2">
            {rank > 0 ? `#${rank}` : "–"} <RankMove delta={move} />
          </span>
          <span className="text-xs text-muted">
            of {activeSorted.length} active · {att.nights} club night{att.nights === 1 ? "" : "s"}
            {att.possible > att.nights ? ` of ${att.possible}` : ""}
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">Record</span>
          <span className="stat-value">
            <span className="text-win">{player.wins}</span>
            <span className="text-muted text-lg">/</span>
            <span className="text-draw">{player.draws}</span>
            <span className="text-muted text-lg">/</span>
            <span className="text-loss">{player.losses}</span>
          </span>
          <span className="text-xs text-muted">{pct === null ? "no games yet" : `${pct}% score · ${player.gamesPlayed} games`}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Streaks & colors</span>
          <span className="flex items-center gap-2 py-0.5">
            <FormDots results={recentForm(db, player.id, 8)} />
          </span>
          <span className="text-xs text-muted flex items-center gap-2 flex-wrap">
            <span title="Longest win streak">🔥 {st.longestWin}</span>
            <span className="flex items-center gap-1" title="Score with white / black">
              <ColorDot color="white" /> {whitePct === null ? "–" : `${whitePct}%`} <ColorDot color="black" /> {blackPct === null ? "–" : `${blackPct}%`}
            </span>
            <span title="Games as white / black">
              ({colors.white}/{colors.black})
            </span>
          </span>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="col-stack">
          <Section title="Rating history">
            <RatingChart series={[{ name: player.name, color: "var(--accent)", points: history }]} names={names} />
          </Section>

          <Section
            title="Games"
            flush
            right={
              games.length > RECENT_GAMES ? (
                <Link href={`/games?q=${encodeURIComponent(player.name)}`} className="btn btn-sm btn-ghost">
                  All {games.length} →
                </Link>
              ) : undefined
            }
          >
            {games.length === 0 ? (
              <Empty icon="♝" title="No games yet" />
            ) : (
              <div className="scroll-x">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th></th>
                      <th>Opponent</th>
                      <th>Result</th>
                      <th className="text-right">Elo</th>
                      <th className="hidden sm:table-cell">Event</th>
                    </tr>
                  </thead>
                  <tbody>
                    {games.slice(0, RECENT_GAMES).map((g) => {
                      const isWhite = g.whiteId === player.id;
                      const oppId = isWhite ? g.blackId : g.whiteId;
                      const score = g.result ? scoreFor(g.result, isWhite ? "white" : "black") : null;
                      const scoreColor = score === 1 ? "text-win" : score === 0 ? "text-loss" : "text-draw";
                      const t = g.tournamentId ? tournaments.get(g.tournamentId) : null;
                      const s = g.sessionId ? sessions.get(g.sessionId) : null;
                      return (
                        <tr key={g.id} className="hover:bg-panel-2/50">
                          <td className="text-muted text-xs whitespace-nowrap">{g.completedAt && formatDateTime(g.completedAt)}</td>
                          <td>
                            <ColorDot color={isWhite ? "white" : "black"} />
                          </td>
                          <td>
                            <PlayerLink id={oppId} name={names.get(oppId)?.name ?? "?"} rating={isWhite ? g.blackRatingBefore : g.whiteRatingBefore} />
                          </td>
                          <td className={`font-mono font-medium ${scoreColor}`}>{resultLabel(g.result)}</td>
                          <td className="text-right font-mono">
                            {isWhite ? g.whiteRatingAfter : g.blackRatingAfter}{" "}
                            <RatingDelta before={isWhite ? g.whiteRatingBefore : g.blackRatingBefore} after={isWhite ? g.whiteRatingAfter : g.blackRatingAfter} />
                          </td>
                          <td className="text-xs text-muted hidden sm:table-cell">
                            {t ? (
                              <Link href={`/tournaments/${t.id}`} className="hover:text-accent">
                                {t.name} · R{g.round}
                              </Link>
                            ) : s ? (
                              <Link href={`/pairing/${s.id}`} className="hover:text-accent">
                                Club night
                              </Link>
                            ) : (
                              "friendly"
                            )}
                            {!g.rated && <span className="ml-1 badge border-muted/40">unrated</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </div>

        <div className="col-stack">
          <Section title="Achievements" right={<span className="text-xs text-muted">{earned.length} of {badges.length}</span>}>
            {earned.length === 0 ? (
              <p className="text-sm text-muted mb-3">Nothing earned yet. The first win is the easiest one.</p>
            ) : (
              <div className="flex flex-wrap gap-2 mb-3">
                {earned.map((a) => (
                  <AchievementChip key={a.key} a={a} />
                ))}
              </div>
            )}
            {locked.length > 0 && (
              <details className="group">
                <summary className="text-xs text-muted cursor-pointer list-none hover:text-fg">
                  <span className="inline-block transition-transform group-open:rotate-90">▸</span> {locked.length} still to earn
                </summary>
                <div className="flex flex-wrap gap-2 mt-3">
                  {locked.map((a) => (
                    <AchievementChip key={a.key} a={a} />
                  ))}
                </div>
              </details>
            )}
          </Section>

          <Section title="Rivals" flush>
            {rv.length === 0 ? (
              <Empty icon="⚔" title="No opponents yet" />
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Opponent</th>
                    <th className="text-right">Games</th>
                    <th className="text-right">W / D / L</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rv.slice(0, 10).map((r) => (
                    <tr key={r.opponentId} className="hover:bg-panel-2/50">
                      <td>
                        <PlayerLink id={r.opponentId} name={names.get(r.opponentId)?.name ?? "?"} avatar />
                      </td>
                      <td className="text-right font-mono">{r.games}</td>
                      <td className="text-right font-mono text-xs nowrap">
                        <span className="text-win">{r.wins}</span> / <span className="text-draw">{r.draws}</span> / <span className="text-loss">{r.losses}</span>
                      </td>
                      <td className="text-right">
                        <Link href={`/h2h?a=${player.id}&b=${r.opponentId}`} className="btn btn-sm btn-ghost">
                          ⚔
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>

          {isMe && (
            <Section title="Your PIN">
              <form action={changeOwnPin} className="flex flex-col gap-3">
                <input type="hidden" name="playerId" value={player.id} />
                <p className="text-xs text-muted -mt-1">Four digits. You need it to claim your profile on another device. Forgot it? Ask the admin for a new one.</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="label">Current</label>
                    <input name="current" type="password" inputMode="numeric" pattern="\d{4}" maxLength={4} required={!!player.pinHash} className="w-full font-mono text-center tracking-widest" autoComplete="off" />
                  </div>
                  <div>
                    <label className="label">New</label>
                    <input name="pin" type="password" inputMode="numeric" pattern="\d{4}" maxLength={4} required className="w-full font-mono text-center tracking-widest" autoComplete="off" />
                  </div>
                  <div>
                    <label className="label">Repeat</label>
                    <input name="confirm" type="password" inputMode="numeric" pattern="\d{4}" maxLength={4} required className="w-full font-mono text-center tracking-widest" autoComplete="off" />
                  </div>
                </div>
                <SubmitButton className="btn" pendingText="Saving…">
                  Change PIN
                </SubmitButton>
              </form>
              <form action={unclaimProfile} className="mt-3 pt-3 border-t border-line text-xs text-muted flex items-center justify-between gap-3">
                <span>Shared tablet or someone else&apos;s phone?</span>
                <SubmitButton className="btn btn-sm btn-ghost" pendingText="…">
                  Forget this device
                </SubmitButton>
              </form>
            </Section>
          )}

          {admin && (
            <>
              <Section title="Edit player">
                <form action={updatePlayer.bind(null, player.id)} className="flex flex-col gap-3">
                  <div>
                    <label className="label">Name</label>
                    <input name="name" defaultValue={player.name} required className="w-full" />
                  </div>
                  <div>
                    <label className="label">Note</label>
                    <input name="note" defaultValue={player.note ?? ""} className="w-full" placeholder="e.g. team, desk, nickname" />
                  </div>
                  <div>
                    <label className="label">Starting Elo</label>
                    <input name="initialRating" type="number" defaultValue={player.initialRating} min={100} max={3000} className="w-full" />
                    <p className="text-xs text-muted mt-1.5">Changing this replays all games and recalculates every rating in the club.</p>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="active" defaultChecked={player.active} /> Active
                    <span className="text-muted text-xs">(shown on leaderboard and in pairings)</span>
                  </label>
                  <SubmitButton pendingText="Saving…">Save changes</SubmitButton>
                </form>
              </Section>

              <Section title="PIN reset">
                <form action={resetPin.bind(null, player.id)} className="flex flex-col gap-3">
                  <p className="text-xs text-muted -mt-1">
                    {player.pinHash ? "This player has a PIN." : "No PIN yet: the player chooses one the first time they say “This is me”."} Set a new one here if they forgot it, or leave the field empty to clear it so they pick a
                    fresh one themselves.
                  </p>
                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <label className="label">New PIN (4 digits, optional)</label>
                      <input name="pin" type="text" inputMode="numeric" pattern="\d{4}" maxLength={4} className="w-full font-mono tracking-widest" autoComplete="off" placeholder="e.g. 4821" />
                    </div>
                    <SubmitButton className="btn" pendingText="Saving…">
                      {player.pinHash ? "Reset PIN" : "Set PIN"}
                    </SubmitButton>
                  </div>
                </form>
              </Section>

              <Section title="Danger zone">
                <p className="text-sm text-muted mb-3">
                  {games.length
                    ? `Deleting removes ${player.name} and all ${games.length} of their games. Other players' ratings are recalculated as if those games never happened. Consider deactivating instead.`
                    : `${player.name} has no games and can be removed cleanly.`}
                </p>
                <ConfirmButton action={deletePlayer.bind(null, player.id)} confirmLabel={games.length ? `Delete player and ${games.length} games` : "Delete player"}>
                  Delete player
                </ConfirmButton>
              </Section>
            </>
          )}
        </div>
      </div>
    </>
  );
}
