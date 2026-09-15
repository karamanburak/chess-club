import Link from "next/link";
import { readDb } from "@/lib/db";
import { getT } from "@/lib/lang";
import { fmt, plural } from "@/lib/i18n";
import { formatDateTime, headToHead, leaderboard, playerMap, resultLabel } from "@/lib/queries";
import { Avatar, ColorDot, Empty, PageHeader, PlayerLink, Section } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function H2HPage({ searchParams }: PageProps<"/h2h">) {
  const sp = await searchParams;
  const { t, lang } = await getT();
  const db = await readDb();
  const names = playerMap(db);
  const players = leaderboard(db, true);
  const a = typeof sp.a === "string" && names.has(sp.a) ? sp.a : players[0]?.id;
  const b = typeof sp.b === "string" && names.has(sp.b) && sp.b !== a ? sp.b : players.find((p) => p.id !== a)?.id;
  const h = a && b ? headToHead(db, a, b) : null;
  const pa = a ? names.get(a) : undefined;
  const pb = b ? names.get(b) : undefined;
  const total = h ? h.games.length : 0;
  const w = (n: number) => (total ? `${(n / total) * 100}%` : "0%");

  return (
    <>
      <PageHeader eyebrow={t.players.h2h.eyebrow} title={t.players.h2h.title} subtitle={<span>{t.players.h2h.subtitle}</span>} />

      <form method="get" className="card flex flex-wrap items-end gap-3 mb-6">
        <div className="flex-1 min-w-40">
          <label className="label">{t.players.h2h.playerA}</label>
          <select name="a" defaultValue={a} className="w-full">
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.rating})
              </option>
            ))}
          </select>
        </div>
        <span className="text-muted pb-2">{t.players.h2h.vs}</span>
        <div className="flex-1 min-w-40">
          <label className="label">{t.players.h2h.playerB}</label>
          <select name="b" defaultValue={b} className="w-full">
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.rating})
              </option>
            ))}
          </select>
        </div>
        <button className="btn btn-primary">{t.players.h2h.compare}</button>
      </form>

      {!h || !pa || !pb ? (
        <div className="card">
          <Empty icon="swords" title={t.players.h2h.needTwo} />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[2fr_3fr]">
          <Section title={t.players.h2h.record}>
            <div className="flex items-center justify-between gap-4 mb-4">
              <div className="flex flex-col items-center gap-2 flex-1">
                <Avatar id={pa.id} name={pa.name} size="lg" />
                <PlayerLink id={pa.id} name={pa.name} className="font-semibold" />
                <span className="font-mono text-accent">{pa.rating}</span>
              </div>
              <div className="text-center">
                <div className="text-4xl font-semibold font-mono tracking-tight">
                  <span className="text-win">{h.aWins}</span>
                  <span className="text-muted text-2xl mx-1">–</span>
                  <span className="text-draw">{h.draws}</span>
                  <span className="text-muted text-2xl mx-1">–</span>
                  <span className="text-loss">{h.bWins}</span>
                </div>
                <div className="text-xs text-muted mt-1">
                  {plural(total, t.common.gamesN)} · {h.aPoints} : {h.bPoints}
                </div>
              </div>
              <div className="flex flex-col items-center gap-2 flex-1">
                <Avatar id={pb.id} name={pb.name} size="lg" />
                <PlayerLink id={pb.id} name={pb.name} className="font-semibold" />
                <span className="font-mono text-accent">{pb.rating}</span>
              </div>
            </div>
            {total > 0 && (
              <div className="flex h-2 rounded-full overflow-hidden">
                <div className="bg-win" style={{ width: w(h.aWins) }} />
                <div className="bg-draw" style={{ width: w(h.draws) }} />
                <div className="bg-loss" style={{ width: w(h.bWins) }} />
              </div>
            )}
            <div className="mt-4 text-sm text-muted">
              {total === 0
                ? t.players.h2h.notPlayed
                : h.aWins === h.bWins
                  ? t.players.h2h.deadEven
                  : fmt(t.players.h2h.leadsBy, { name: h.aWins > h.bWins ? pa.name : pb.name, n: Math.abs(h.aWins - h.bWins) })}{" "}
              {t.players.h2h.ratingGap} <span className="font-mono">{Math.abs(pa.rating - pb.rating)}</span>.
            </div>
          </Section>

          <Section title={t.players.h2h.gamesBetween} flush>
            {h.games.length === 0 ? (
              <Empty icon="pawn" title={t.players.h2h.noGames}>
                <Link href="/pairing" className="text-accent hover:underline">
                  {t.players.h2h.startNight}
                </Link>{" "}
                {t.players.h2h.seeWhoWins}
              </Empty>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>{t.players.h2h.date}</th>
                    <th>{pa.name}</th>
                    <th className="text-center">{t.common.result}</th>
                    <th>{pb.name}</th>
                  </tr>
                </thead>
                <tbody>
                  {h.games.map((g) => {
                    const aWhite = g.whiteId === a;
                    const sa = g.result ? (aWhite ? (g.result === "1-0" || g.result === "+/-" ? 1 : g.result === "1/2-1/2" ? 0.5 : 0) : g.result === "0-1" || g.result === "-/+" ? 1 : g.result === "1/2-1/2" ? 0.5 : 0) : null;
                    return (
                      <tr key={g.id}>
                        <td className="text-xs text-muted whitespace-nowrap">{g.completedAt && formatDateTime(g.completedAt, lang)}</td>
                        <td className={sa === 1 ? "font-semibold text-win" : sa === 0 ? "text-muted" : ""}>
                          <span className="inline-flex items-center gap-2">
                            <ColorDot color={aWhite ? "white" : "black"} /> {aWhite ? g.whiteRatingBefore : g.blackRatingBefore}
                          </span>
                        </td>
                        <td className="text-center font-mono">{aWhite ? resultLabel(g.result) : resultLabel(g.result).split("").reverse().join("")}</td>
                        <td className={sa === 0 ? "font-semibold text-win" : sa === 1 ? "text-muted" : ""}>
                          <span className="inline-flex items-center gap-2">
                            <ColorDot color={aWhite ? "black" : "white"} /> {aWhite ? g.blackRatingBefore : g.whiteRatingBefore}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Section>
        </div>
      )}
    </>
  );
}
