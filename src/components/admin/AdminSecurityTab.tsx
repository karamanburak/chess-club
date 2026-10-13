import { changePassword, clearMemberCode, setMemberCode, signOutEverywhere } from "@/lib/actions";
import { fmt } from "@/lib/i18n";
import { getT } from "@/lib/lang";
import { ntfyLabel } from "@/lib/notify";
import { formatDateTime } from "@/lib/queries";
import type { Database } from "@/lib/types";
import { ConfirmButton } from "@/components/ConfirmButton";
import { SubmitButton } from "@/components/SubmitButton";
import { Section } from "@/components/ui";

/** Activity entries shown before "show all". */
const ACTIVITY_PREVIEW = 60;

/** Admin → Security: admin password, member code, sign out everywhere, the activity log. */
export async function AdminSecurityTab({ db, query }: { db: Database; query: { q?: unknown; who?: unknown; all?: unknown } }) {
  const { t, lang } = await getT();
  const a = t.admin;

  const q = typeof query.q === "string" ? query.q.trim() : "";
  const who = query.who === "admin" || query.who === "guest" ? query.who : "";
  const showAll = query.all === "1";
  const filtering = q !== "" || who !== "";
  const matching = [...db.activity].reverse().filter((x) => (who === "" || (who === "admin") === x.admin) && (q === "" || x.text.toLowerCase().includes(q.toLowerCase())));
  const activity = showAll ? matching : matching.slice(0, ACTIVITY_PREVIEW);
  const ntfy = db.settings.clubNotifyOff ? null : ntfyLabel();
  const activityQuery = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    p.set("tab", "security");
    if (q) p.set("q", q);
    if (who) p.set("who", who);
    for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/admin?${s}#activity` : "/admin#activity";
  };

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="col-stack">
        <Section title={a.password.title}>
          <form action={changePassword} className="flex flex-col gap-3">
            <div>
              <label htmlFor="f-password-current" className="label">{a.password.current}</label>
              <input id="f-password-current" name="current" type="password" required className="w-full" autoComplete="current-password" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="f-password-next" className="label">{a.password.next}</label>
                <input id="f-password-next" name="password" type="password" required minLength={4} className="w-full" autoComplete="new-password" />
              </div>
              <div>
                <label htmlFor="f-password-repeat" className="label">{a.password.repeat}</label>
                <input id="f-password-repeat" name="confirm" type="password" required minLength={4} className="w-full" autoComplete="new-password" />
              </div>
            </div>
            <SubmitButton className="btn" pendingText={t.common.saving}>
              {a.password.submit}
            </SubmitButton>
            <p className="text-xs text-muted">{a.sessions.passwordHint}</p>
          </form>
        </Section>
        <Section title={<span id="member">{a.member.title}</span>}>
          <div className="flex flex-col gap-3 text-sm">
            <p className="text-muted text-xs">{a.member.hint}</p>
            <div className={`rounded-xl border px-4 py-2.5 flex items-center justify-between gap-3 ${db.settings.memberCodeHash ? "border-win/40 bg-win/5" : "border-line"}`}>
              <span className="font-medium">{db.settings.memberCodeHash ? a.member.on : a.member.off}</span>
              {db.settings.memberCodeHash && (
                <ConfirmButton action={clearMemberCode} className="btn btn-sm" confirmLabel={a.member.turnOff}>
                  {a.member.turnOff}
                </ConfirmButton>
              )}
            </div>
            <form action={setMemberCode} className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="f-member-code" className="label">{db.settings.memberCodeHash ? a.member.newCode : a.member.code}</label>
                <input id="f-member-code" name="code" type="text" required minLength={4} className="w-full" autoComplete="off" placeholder={a.member.codePlaceholder} />
              </div>
              <div>
                <label htmlFor="f-member-repeat" className="label">{a.member.repeat}</label>
                <input id="f-member-repeat" name="confirm" type="text" required minLength={4} className="w-full" autoComplete="off" />
              </div>
              <SubmitButton className="btn col-span-2" pendingText={t.common.saving}>
                {db.settings.memberCodeHash ? a.member.change : a.member.turnOn}
              </SubmitButton>
            </form>
          </div>
        </Section>
      </div>
      <div className="col-stack">
        <Section title={a.sessions.title}>
          <div className="flex flex-col gap-3 text-sm">
            <p className="text-xs text-muted">{a.sessions.hint}</p>
            <ConfirmButton action={signOutEverywhere} className="btn btn-danger self-start" confirmLabel={a.sessions.confirm}>
              {a.sessions.button}
            </ConfirmButton>
          </div>
        </Section>
        <Section
          title={<span id="activity">{a.activity.title}</span>}
          flush
          right={
            <span className="flex items-center gap-2 text-xs text-muted">
              {ntfy ? (
                <span className="badge border-win/40 text-win" title={fmt(a.activity.pushOnHint, { topic: ntfy })}>
                  {a.activity.pushOn}
                </span>
              ) : (
                <span className="badge" title={a.activity.pushOffHint}>
                  {a.activity.pushOff}
                </span>
              )}
              {filtering ? fmt(a.activity.matching, { n: matching.length, total: db.activity.length }) : fmt(a.activity.lastOf, { n: activity.length, total: db.activity.length })}
            </span>
          }
        >
          <form method="get" action="/admin#activity" role="search" className="flex flex-wrap gap-2 px-4 pb-3 text-sm">
            <input type="hidden" name="tab" value="security" />
            <input type="search" name="q" defaultValue={q} placeholder={a.activity.search} className="flex-1 min-w-40" aria-label={a.activity.search} />
            <select name="who" defaultValue={who} className="w-auto" aria-label={a.activity.filter}>
              <option value="">{a.activity.everyone}</option>
              <option value="admin">{a.activity.onlyAdmin}</option>
              <option value="guest">{a.activity.onlyGuests}</option>
            </select>
            {showAll && <input type="hidden" name="all" value="1" />}
            <button type="submit" className="btn btn-sm">
              {a.activity.filter}
            </button>
          </form>
          {db.activity.length === 0 ? (
            <p className="text-sm text-muted px-4 py-3">{a.activity.empty}</p>
          ) : matching.length === 0 ? (
            <p className="text-sm text-muted px-4 py-3">{a.activity.noMatch}</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto divide-y divide-line text-sm border-t border-line">
              {activity.map((x) => (
                <li key={x.id} className="flex items-start gap-3 px-4 py-2">
                  <span className="text-xs text-muted font-mono whitespace-nowrap pt-0.5">{formatDateTime(x.at, lang)}</span>
                  <span className="flex-1 min-w-0">{x.text}</span>
                  <span className={`badge shrink-0 ${x.admin ? "border-win/40 text-win" : "border-line text-muted"}`} title={x.admin ? a.activity.adminHint : a.activity.guestHint}>
                    {x.admin ? a.activity.adminBadge : a.activity.guestBadge}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {matching.length > ACTIVITY_PREVIEW && (
            <div className="px-4 py-2 border-t border-line text-xs">
              <a href={activityQuery({ all: showAll ? "" : "1" })} className="underline text-muted hover:text-fg">
                {showAll ? a.activity.showLess : fmt(a.activity.showAll, { total: matching.length })}
              </a>
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}
