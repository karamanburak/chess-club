import { readDb } from "@/lib/db";
import { dayOf } from "@/lib/time";
import { currentPlayerId, isAdmin } from "@/lib/auth";
import { effectiveStatus, involves, toIcs } from "@/lib/challenges";
import { getT } from "@/lib/lang";

export const dynamic = "force-dynamic";

/** Calendar file for one agreed game. Only the two players (or the admin) can fetch it. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const db = await readDb();
  const c = db.challenges.find((x) => x.id === id);
  if (!c) return new Response("Not found", { status: 404 });
  const me = await currentPlayerId();
  if (!(await isAdmin()) && !(me && involves(c, me))) return new Response("Forbidden", { status: 403 });
  if (effectiveStatus(c) !== "accepted") return new Response("Not agreed yet", { status: 409 });
  const name = (pid: string) => db.players.find((p) => p.id === pid)?.name ?? "?";
  const { t } = await getT();
  const body = toIcs(c, { from: name(c.fromId), to: name(c.toId), club: db.settings.club.name }, t.challenges.calendarEvent);
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="chess-${dayOf(c.at)}.ics"`,
    },
  });
}
