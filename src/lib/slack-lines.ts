import { dicts, fmt, type Dict, type Lang } from "./i18n";
import { formatDateTime } from "./queries";
import { slackEscape } from "./slack";
import type { Challenge, Database } from "./types";

/** What a Slack line may say about a challenge: escaped names and "date · place · format". */
export type SlackFacts = { from: string; to: string; details: string };

/**
 * The text of one Slack post about challenge `c`, in `lang`. Only names, time, place and format go out: never the
 * note or anything else members typed for each other. Everything user-typed is escaped for Slack's mrkdwn.
 */
export function slackLine(db: Database, c: Challenge, lang: Lang, text: (m: Dict["challenges"]["slack"], f: SlackFacts) => string): string {
  const m = dicts[lang].challenges;
  const name = (id: string) => slackEscape(db.players.find((p) => p.id === id)?.name ?? "?");
  const format = c.session ? fmt(m.sessionPill, { duration: m.durations[String(c.session.minutes) as keyof typeof m.durations] ?? String(c.session.minutes) }) : c.timeControl;
  const details = [formatDateTime(c.at, lang), c.place, format].filter(Boolean).map((x) => slackEscape(x)).join(" · ");
  return text(m.slack, { from: name(c.fromId), to: name(c.toId), details });
}
