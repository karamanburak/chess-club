import Link from "next/link";
import { notFound } from "next/navigation";
import { readDb } from "@/lib/db";
import { isAdmin } from "@/lib/auth";
import { getT } from "@/lib/lang";
import { fmt, plural } from "@/lib/i18n";
import { sessionDelete } from "@/lib/actions";
import { formatDateTime, playerMap, sessionSummary } from "@/lib/queries";
import { ConfirmButton } from "@/components/ConfirmButton";
import { PageHeader, PlayerLink, Rank, Section } from "@/components/ui";
import { RoundList } from "@/components/RoundList";

export const dynamic = "force-dynamic";

export default async function SessionPage({ params }: PageProps<"/pairing/[id]">) {
  const { id } = await params;
  const { t, lang } = await getT();
  const db = await readDb();
  const admin = await isAdmin();
  const s = db.sessions.find((x) => x.id === id);
  if (!s) notFound();
  const names = playerMap(db);
  const games = new Map(db.games.map((g) => [g.id, g]));
  const summary = sessionSummary(db, s);

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/pairing" className="hover:text-fg">
            ← {t.pairing.clubNights}
          </Link>
        }
        title={`${t.common.clubNight} · ${formatDateTime(s.createdAt, lang)}`}
        subtitle={
          <span>
            {plural(s.presentIds.length, t.common.playersN)} · {plural(s.rounds.length, t.common.roundsN)} · {s.rated ? t.common.rated : t.common.unrated}
            {s.closedAt && ` · ${fmt(t.pairing.closedAt, { time: formatDateTime(s.closedAt, lang) })}`}
          </span>
        }
        actions={
          admin ? (
            <ConfirmButton action={sessionDelete.bind(null, s.id)} confirmLabel={t.pairing.deleteNightConfirm}>
              {t.common.delete}
            </ConfirmButton>
          ) : undefined
        }
      />
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="flex flex-col gap-3">
          {s.rounds.map((r) => (
            <Section key={r.number} title={fmt(t.common.roundN, { n: r.number })} flush>
              <RoundList r={r} games={games} names={names} />
            </Section>
          ))}
        </div>
        <Section title={t.pairing.nightResults} flush>
          <table className="table">
            <thead>
              <tr>
                <th className="w-10 text-center">#</th>
                <th>{t.common.player}</th>
                <th className="text-right">{t.common.points}</th>
                <th className="text-right">{t.pairing.wdlShort}</th>
                <th className="text-right">{t.pairing.eloDelta}</th>
              </tr>
            </thead>
            <tbody>
              {summary.map((r, i) => (
                <tr key={r.playerId}>
                  <td className="text-center">{r.games ? <Rank n={i + 1} /> : "–"}</td>
                  <td>
                    <PlayerLink id={r.playerId} name={names.get(r.playerId)?.name ?? "?"} avatar className="font-medium" />
                  </td>
                  <td className="text-right font-mono text-accent">{r.points}</td>
                  <td className="text-right font-mono text-xs">
                    {r.wins}/{r.draws}/{r.losses}
                  </td>
                  <td className={`text-right font-mono text-xs ${r.ratingChange > 0 ? "text-win" : r.ratingChange < 0 ? "text-loss" : "text-muted"}`}>
                    {r.ratingChange > 0 ? "+" : ""}
                    {r.ratingChange}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      </div>
    </>
  );
}
