import { notFound } from "next/navigation";
import { Icon } from "@/components/icons";
import Link from "next/link";
import { readDb } from "@/lib/db";
import { getT } from "@/lib/lang";
import { fmt, plural } from "@/lib/i18n";
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
  const { t: msg, lang } = await getT();
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
  const nextTitleLabel = next ? (msg.club.titles[next.title.key as keyof typeof msg.club.titles] ?? next.title.label) : "";
  const badges = achievements(db, player.id);
  const earned = badges.filter((a) => a.earnedAt).sort((a, b) => b.earnedAt!.localeCompare(a.earnedAt!));
  const locked = badges.filter((a) => !a.earnedAt);
  const att = attendance(db, player);
  const p = msg.players.profile;

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/players" className="hover:text-fg">
            {p.backToPlayers}
          </Link>
        }
        title={
          <span className="flex items-center gap-3">
            <AvatarPicker playerId={player.id} name={player.name} seed={player.avatar} choices={avatarChoices(player.id, 23)} canEdit={admin || isMe} />
            <span className="flex items-center gap-2 flex-wrap">
              {player.name}
              {isMe && <span className="badge border-accent/40 text-accent">{msg.common.you}</span>}
              <TitleBadge title={title} />
              <Provisional games={player.gamesPlayed} />
              <StreakBadge streak={st.current} />
              {!player.active && <span className="badge border-muted/40 text-muted">{p.inactive}</span>}
            </span>
          </span>
        }
        subtitle={player.note ? <span>{player.note}</span> : undefined}
        actions={
          rv[0] ? (
            <Link href={`/h2h?a=${player.id}&b=${rv[0].opponentId}`} className="btn">
              <Icon name="swords" className="h-4 w-4" /> {fmt(p.vs, { name: names.get(rv[0].opponentId)?.name })}
            </Link>
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="stat">
          <span className="stat-label">{msg.common.elo}</span>
          <span className="stat-value text-accent">{player.rating}</span>
          <span className="text-xs text-muted">{fmt(p.peakStarted, { peak, start: player.initialRating })}</span>
          {next && (
            <span className="text-xs text-muted">
              {next.games > 0 ? plural(next.games, p.moreGamesForTitle) : fmt(p.toTitle, { n: next.missing, title: nextTitleLabel })}
            </span>
          )}
        </div>
        <div className="stat">
          <span className="stat-label">{p.rank}</span>
          <span className="stat-value flex items-center gap-2">
            {rank > 0 ? `#${rank}` : "–"} <RankMove delta={move} />
          </span>
          <span className="text-xs text-muted">
            {fmt(p.ofActive, { n: activeSorted.length })} · {plural(att.nights, p.clubNights)}
            {att.possible > att.nights ? ` ${fmt(p.ofPossible, { n: att.possible })}` : ""}
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">{p.record}</span>
          <span className="stat-value">
            <span className="text-win">{player.wins}</span>
            <span className="text-muted text-lg">/</span>
            <span className="text-draw">{player.draws}</span>
            <span className="text-muted text-lg">/</span>
            <span className="text-loss">{player.losses}</span>
          </span>
          <span className="text-xs text-muted">{pct === null ? p.noGamesYet : fmt(p.scoreGames, { pct, games: plural(player.gamesPlayed, msg.common.gamesN) })}</span>
        </div>
        <div className="stat">
          <span className="stat-label">{p.streaksColors}</span>
          <span className="flex items-center gap-2 py-0.5">
            <FormDots results={recentForm(db, player.id, 8)} />
          </span>
          <span className="text-xs text-muted flex items-center gap-2 flex-wrap">
            <span title={p.longestWinStreak}>🔥 {st.longestWin}</span>
            <span className="flex items-center gap-1" title={p.scoreWithColors}>
              <ColorDot color="white" /> {whitePct === null ? "–" : `${whitePct}%`} <ColorDot color="black" /> {blackPct === null ? "–" : `${blackPct}%`}
            </span>
            <span title={p.gamesAsColors}>
              ({colors.white}/{colors.black})
            </span>
          </span>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="col-stack">
          <Section title={p.ratingHistory}>
            <RatingChart series={[{ name: player.name, color: "var(--accent)", points: history }]} names={names} />
          </Section>

          <Section
            title={msg.common.games}
            flush
            right={
              games.length > RECENT_GAMES ? (
                <Link href={`/games?q=${encodeURIComponent(player.name)}`} className="btn btn-sm btn-ghost">
                  {fmt(p.allN, { n: games.length })}
                </Link>
              ) : undefined
            }
          >
            {games.length === 0 ? (
              <Empty icon="list" title={p.noGames} />
            ) : (
              <div className="scroll-x">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{p.date}</th>
                      <th></th>
                      <th>{p.opponent}</th>
                      <th>{msg.common.result}</th>
                      <th className="text-right">{msg.common.elo}</th>
                      <th className="hidden sm:table-cell">{p.event}</th>
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
                          <td className="text-muted text-xs whitespace-nowrap">{g.completedAt && formatDateTime(g.completedAt, lang)}</td>
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
                                {t.name} · {fmt(p.roundShort, { n: g.round })}
                              </Link>
                            ) : s ? (
                              <Link href={`/pairing/${s.id}`} className="hover:text-accent">
                                {msg.common.clubNight}
                              </Link>
                            ) : (
                              p.friendly
                            )}
                            {!g.rated && <span className="ml-1 badge border-muted/40">{msg.common.unrated}</span>}
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
          <Section title={p.achievements} right={<span className="text-xs text-muted">{fmt(p.nOfTotal, { n: earned.length, total: badges.length })}</span>}>
            {earned.length === 0 ? (
              <p className="text-sm text-muted mb-3">{p.nothingEarned}</p>
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
                  <span className="inline-block transition-transform group-open:rotate-90">▸</span> {fmt(p.stillToEarn, { n: locked.length })}
                </summary>
                <div className="flex flex-wrap gap-2 mt-3">
                  {locked.map((a) => (
                    <AchievementChip key={a.key} a={a} />
                  ))}
                </div>
              </details>
            )}
          </Section>

          <Section title={p.rivals} flush>
            {rv.length === 0 ? (
              <Empty icon="swords" title={p.noOpponents} />
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>{p.opponent}</th>
                    <th className="text-right">{msg.common.games}</th>
                    <th className="text-right">{msg.common.wdl}</th>
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
            <Section title={p.yourPin}>
              <form action={changeOwnPin} className="flex flex-col gap-3">
                <input type="hidden" name="playerId" value={player.id} />
                <p className="text-xs text-muted -mt-1">{p.pinHint}</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="label">{p.current}</label>
                    <input name="current" type="password" inputMode="numeric" pattern="\d{4}" maxLength={4} required={!!player.pinHash} className="w-full font-mono text-center tracking-widest" autoComplete="off" />
                  </div>
                  <div>
                    <label className="label">{p.new}</label>
                    <input name="pin" type="password" inputMode="numeric" pattern="\d{4}" maxLength={4} required className="w-full font-mono text-center tracking-widest" autoComplete="off" />
                  </div>
                  <div>
                    <label className="label">{p.repeat}</label>
                    <input name="confirm" type="password" inputMode="numeric" pattern="\d{4}" maxLength={4} required className="w-full font-mono text-center tracking-widest" autoComplete="off" />
                  </div>
                </div>
                <SubmitButton className="btn" pendingText={msg.common.saving}>
                  {p.changePin}
                </SubmitButton>
              </form>
              <form action={unclaimProfile} className="mt-3 pt-3 border-t border-line text-xs text-muted flex items-center justify-between gap-3">
                <span>{p.sharedDevice}</span>
                <SubmitButton className="btn btn-sm btn-ghost" pendingText="…">
                  {p.forgetDevice}
                </SubmitButton>
              </form>
            </Section>
          )}

          {admin && (
            <>
              <Section title={p.editPlayer}>
                <form action={updatePlayer.bind(null, player.id)} className="flex flex-col gap-3">
                  <div>
                    <label className="label">{p.name}</label>
                    <input name="name" defaultValue={player.name} required className="w-full" />
                  </div>
                  <div>
                    <label className="label">{p.note}</label>
                    <input name="note" defaultValue={player.note ?? ""} className="w-full" placeholder={p.notePlaceholder} />
                  </div>
                  <div>
                    <label className="label">{p.startingElo}</label>
                    <input name="initialRating" type="number" defaultValue={player.initialRating} min={100} max={3000} className="w-full" />
                    <p className="text-xs text-muted mt-1.5">{p.startingEloHint}</p>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="active" defaultChecked={player.active} /> {p.active}
                    <span className="text-muted text-xs">{p.activeHint}</span>
                  </label>
                  <SubmitButton pendingText={msg.common.saving}>{p.saveChanges}</SubmitButton>
                </form>
              </Section>

              <Section title={p.pinReset}>
                <form action={resetPin.bind(null, player.id)} className="flex flex-col gap-3">
                  <p className="text-xs text-muted -mt-1">
                    {player.pinHash ? p.hasPin : p.noPin} {p.pinResetHint}
                  </p>
                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <label className="label">{p.newPinOptional}</label>
                      <input name="pin" type="text" inputMode="numeric" pattern="\d{4}" maxLength={4} className="w-full font-mono tracking-widest" autoComplete="off" placeholder={p.pinPlaceholder} />
                    </div>
                    <SubmitButton className="btn" pendingText={msg.common.saving}>
                      {player.pinHash ? p.resetPin : p.setPin}
                    </SubmitButton>
                  </div>
                </form>
              </Section>

              <Section title={p.dangerZone}>
                <p className="text-sm text-muted mb-3">
                  {games.length ? fmt(p.deleteWarning, { name: player.name, n: games.length }) : fmt(p.deleteClean, { name: player.name })}
                </p>
                <ConfirmButton action={deletePlayer.bind(null, player.id)} confirmLabel={games.length ? fmt(p.deleteConfirmN, { n: games.length }) : p.deletePlayer}>
                  {p.deletePlayer}
                </ConfirmButton>
              </Section>
            </>
          )}
        </div>
      </div>
    </>
  );
}
