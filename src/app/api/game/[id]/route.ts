import { readDb } from "@/lib/db";
import { dayOf } from "@/lib/time";
import { currentPlayerId, isAdmin, isMember } from "@/lib/auth";
import { eventIcs } from "@/lib/challenges";
import { fmt } from "@/lib/i18n";
import { getT } from "@/lib/lang";
import { knockoutRoundName, knockoutRounds } from "@/lib/queries";
import { gameCalendarEvent, schedulableIn } from "@/lib/schedule";

export const dynamic = "force-dynamic";

/** Calendar file for one scheduled tournament game. Only the two players (or the admin) can fetch it. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  // /api is outside the proxy's member-code gate, so a device whose club access ended must be refused here.
  if (!(await isMember())) return new Response("Forbidden", { status: 403 });
  const db = await readDb();
  const g = db.games.find((x) => x.id === id);
  if (!g) return new Response("Not found", { status: 404 });
  const me = await currentPlayerId();
  if (!(await isAdmin()) && !(me && (g.whiteId === me || g.blackId === me))) return new Response("Forbidden", { status: 403 });
  const t = schedulableIn(db, g);
  if (!t || !g.scheduledAt) return new Response("No date set", { status: 409 });
  const name = (pid: string) => db.players.find((p) => p.id === pid)?.name ?? "?";
  const { t: msg } = await getT();
  const round =
    t.pairingMode === "knockout"
      ? knockoutRoundName(g.round ?? 1, knockoutRounds(t), msg.tournaments.rounds)
      : fmt(msg.common.roundN, { n: g.round ?? 1 });
  const event = gameCalendarEvent(
    g,
    { white: name(g.whiteId), black: name(g.blackId), club: db.settings.club.name, where: fmt(msg.tournaments.schedule.where, { tournament: t.name, round }), timeControl: t.timeControl },
    msg.challenges.calendarEvent,
  );
  if (!event) return new Response("No date set", { status: 409 });
  // No stored "last changed" for a game's date: the time itself keeps DTSTAMP stable per version.
  return new Response(eventIcs(event, `game-${g.id}`, new Date(g.scheduledAt)), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="chess-${dayOf(g.scheduledAt)}.ics"`,
    },
  });
}
