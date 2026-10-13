import os from "node:os";
import type { ReactNode } from "react";
import Link from "next/link";
import { clearMemberCode, closeSeason, renameSeason, reopenSeason, setSwitch, startSeason, updateClub, updateSettings, type SwitchKey } from "@/lib/actions";
import { currentSeason, seasonChampion, seasonOverdue, seasonTable } from "@/lib/club";
import { fmt, LANG_NAMES, LANGS } from "@/lib/i18n";
import { getT } from "@/lib/lang";
import { ntfyTopic } from "@/lib/notify";
import { formatDate, playerMap, TIEBREAK_PRESETS } from "@/lib/queries";
import { requestOrigin } from "@/lib/request-url";
import { nameOf } from "@/lib/score";
import { slackWebhook } from "@/lib/slack";
import { pushKeys } from "@/lib/push";
import { localDay } from "@/lib/time";
import type { Database } from "@/lib/types";
import { ConfirmButton } from "@/components/ConfirmButton";
import { PuzzleAdminCard } from "@/components/PuzzleAdminCard";
import { Qr } from "@/components/Qr";
import { SubmitButton } from "@/components/SubmitButton";
import { Section } from "@/components/ui";

function lanAddresses(): string[] {
  const out: string[] = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list ?? []) if (i.family === "IPv4" && !i.internal) out.push(i.address);
  }
  return out;
}

/** Admin → Club: the switches, club identity, settings, seasons, phone QR and the puzzle card. */
export async function AdminClubTab({ db }: { db: Database }) {
  const { t, lang } = await getT();
  const a = t.admin;
  const sw = a.switches;
  const origin = await requestOrigin();
  const lan = lanAddresses();

  /** One row per switch: what it is, whether it is on, and the one button that flips it. */
  const switchRow = ({ label, hint, on, control, note }: { label: string; hint: string; on: boolean | null; control: ReactNode; note?: string }) => (
    <li key={label} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-line/70 px-4 py-3">
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 font-medium">
          {label}
          <span className={`badge ${on === null ? "text-muted" : on ? "border-win/40 text-win" : "text-muted"}`}>{on === null ? sw.notSetUp : on ? sw.on : sw.off}</span>
        </span>
        <span className="block text-xs text-muted">{note ?? hint}</span>
      </span>
      <span className="shrink-0">{control}</span>
    </li>
  );
  const toggle = (key: SwitchKey, on: boolean) => (
    <form action={setSwitch.bind(null, key, !on)}>
      <SubmitButton className={on ? "btn btn-sm" : "btn btn-sm btn-primary"} pendingText="…">
        {on ? sw.turnOff : sw.turnOn}
      </SubmitButton>
    </form>
  );
  const clubFeedReady = !!ntfyTopic();
  const slackReady = !!slackWebhook();
  const pushReady = !!pushKeys();

  const club = db.settings.club;
  const season = currentSeason(db);
  const seasonTop = season ? seasonTable(db, season)[0] : null;
  const pastSeasons = db.seasons
    .filter((s) => s.end)
    .sort((x, y) => y.start.localeCompare(x.start))
    .map((s) => ({ ...s, champion: seasonChampion(db, s) }));
  const names = playerMap(db);
  const today = localDay();
  const presetKey = TIEBREAK_PRESETS.find((p) => p.order.join() === db.settings.defaultTiebreaks.join())?.key ?? "club";
  const presetLabel = (key: string, fallback: string) => (key in a.settings.tiebreakPresets ? a.settings.tiebreakPresets[key as keyof typeof a.settings.tiebreakPresets] : fallback);

  return (
    <>
      <div className="mb-6">
        <Section title={sw.title} right={<span className="text-xs text-muted">{sw.hint}</span>}>
          <ul className="grid gap-2 lg:grid-cols-2 text-sm">
            {switchRow({
              label: sw.member.label,
              hint: sw.member.hint,
              on: !!db.settings.memberCodeHash,
              control: db.settings.memberCodeHash ? (
                <ConfirmButton action={clearMemberCode} className="btn btn-sm" confirmLabel={sw.turnOff}>
                  {sw.turnOff}
                </ConfirmButton>
              ) : (
                <Link href="/admin?tab=security#member" className="btn btn-sm btn-primary">
                  {sw.setUp}
                </Link>
              ),
            })}
            {switchRow({ label: sw.signup.label, hint: sw.signup.hint, on: !db.settings.selfSignupOff, control: toggle("selfSignup", !db.settings.selfSignupOff) })}
            {switchRow({ label: sw.clubNotify.label, hint: sw.clubNotify.hint, on: clubFeedReady ? !db.settings.clubNotifyOff : null, note: clubFeedReady ? undefined : sw.clubNotify.missing, control: clubFeedReady ? toggle("clubNotify", !db.settings.clubNotifyOff) : null })}
            {switchRow({ label: sw.slack.label, hint: sw.slack.hint, on: slackReady ? !db.settings.slackOff : null, note: slackReady ? undefined : sw.slack.missing, control: slackReady ? toggle("slack", !db.settings.slackOff) : null })}
            {switchRow({ label: sw.push.label, hint: sw.push.hint, on: pushReady ? !db.settings.pushOff : null, note: pushReady ? undefined : sw.push.missing, control: pushReady ? toggle("push", !db.settings.pushOff) : null })}
          </ul>
        </Section>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="col-stack">
          <Section title={a.identity.title}>
            <form action={updateClub} className="flex flex-col gap-3">
              <div>
                <label htmlFor="f-identity-name" className="label">{a.identity.name}</label>
                <input id="f-identity-name" name="name" defaultValue={club.name} required className="w-full" />
              </div>
              <div>
                <label htmlFor="f-identity-nextNight" className="label">{a.identity.nextNight}</label>
                <input id="f-identity-nextNight" name="nextNight" type="date" defaultValue={club.nextNight} className="w-full" />
              </div>
              <div>
                <label htmlFor="f-identity-meets" className="label">{a.identity.meets}</label>
                <input id="f-identity-meets" name="meets" defaultValue={club.meets} className="w-full" placeholder={a.identity.meetsPlaceholder} />
              </div>
              <div>
                <label htmlFor="f-identity-notice" className="label">{a.identity.notice}</label>
                <textarea id="f-identity-notice" name="announcement" defaultValue={club.announcement} maxLength={300} rows={2} className="w-full" placeholder={a.identity.noticePlaceholder} />
              </div>
              <SubmitButton className="btn" pendingText={t.common.saving}>
                {a.identity.save}
              </SubmitButton>
            </form>
          </Section>
          <Section title={a.settings.title}>
            <form action={updateSettings} className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="f-settings-startRating" className="label">{a.settings.startRating}</label>
                  <input id="f-settings-startRating" name="startRating" type="number" min={100} max={3000} defaultValue={db.settings.startRating} className="w-full" />
                </div>
                <div>
                  <label htmlFor="f-settings-byePoints" className="label">{a.settings.byePoints}</label>
                  <select id="f-settings-byePoints" name="byePoints" defaultValue={String(db.settings.byePoints)} className="w-full">
                    <option value="1">{a.settings.onePoint}</option>
                    <option value="0.5">{a.settings.halfPoint}</option>
                  </select>
                </div>
              </div>
              <div>
                <label htmlFor="f-settings-tiebreaks" className="label">{a.settings.tiebreaks}</label>
                <select id="f-settings-tiebreaks" name="tiebreaks" defaultValue={presetKey} className="w-full">
                  {TIEBREAK_PRESETS.map((p) => (
                    <option key={p.key} value={p.key}>
                      {presetLabel(p.key, p.label)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="f-settings-language" className="label">{a.settings.language}</label>
                <select id="f-settings-language" name="language" defaultValue={db.settings.language ?? "en"} className="w-full">
                  {LANGS.map((l) => (
                    <option key={l} value={l}>
                      {LANG_NAMES[l]}
                    </option>
                  ))}
                </select>
              </div>
              <SubmitButton className="btn" pendingText={t.common.saving}>
                {t.common.save}
              </SubmitButton>
            </form>
          </Section>
        </div>
        <div className="col-stack">
          <Section title={a.seasons.title} right={<a id="seasons" href="/hall-of-fame" className="btn btn-sm btn-ghost">{a.seasons.hallOfFame}</a>}>
            <div className="flex flex-col gap-4 text-sm">
              {season ? (
                <div className="rounded-xl border border-accent/40 bg-accent/5 px-4 py-3 flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium">{season.name}</div>
                      <div className="text-xs text-muted">
                        {fmt(a.seasons.runningSince, { date: formatDate(season.start, lang) })}
                        {seasonTop ? fmt(a.seasons.leader, { name: nameOf(names, seasonTop.playerId), points: seasonTop.points }) : a.seasons.noGamesYet}
                      </div>
                    </div>
                    <ConfirmButton action={closeSeason.bind(null, season.id)} className="btn btn-sm" confirmLabel={a.seasons.closeConfirm}>
                      {a.seasons.close}
                    </ConfirmButton>
                  </div>
                  <form action={renameSeason.bind(null, season.id)} className="flex gap-2">
                    <input name="name" defaultValue={season.name} className="flex-1" aria-label={a.seasons.nameLabel} />
                    <SubmitButton className="btn btn-sm" pendingText="…">
                      {a.seasons.rename}
                    </SubmitButton>
                  </form>
                  {seasonOverdue(season) && <p className="text-xs text-accent">{fmt(a.seasons.overdue, { months: seasonOverdue(season) })}</p>}
                  <p className="text-xs text-muted">{a.seasons.closingHint}</p>
                </div>
              ) : (
                <form action={startSeason} className="flex flex-col gap-2 rounded-xl border border-line px-4 py-3">
                  <div className="font-medium">{a.seasons.startNext}</div>
                  <div className="grid grid-cols-2 gap-2">
                    <input name="name" placeholder={fmt(a.seasons.namePlaceholder, { year: today.slice(0, 4) })} aria-label={a.seasons.nameLabel} />
                    <input name="start" type="date" defaultValue={today} aria-label={a.seasons.startDate} />
                  </div>
                  <SubmitButton className="btn btn-primary btn-sm" pendingText={a.seasons.starting}>
                    {a.seasons.start}
                  </SubmitButton>
                </form>
              )}
              {pastSeasons.length > 0 && (
                <ul className="flex flex-col divide-y divide-line">
                  {pastSeasons.map((s, i) => (
                    <li key={s.id} className="flex items-center justify-between gap-3 py-2">
                      <span>
                        <span className="font-medium">{s.name}</span>
                        <span className="block text-xs text-muted">
                          {formatDate(s.start, lang)} – {s.end ? formatDate(s.end, lang) : ""} · {s.champion ? fmt(a.seasons.champion, { name: nameOf(names, s.champion) }) : a.seasons.noChampion}
                        </span>
                      </span>
                      {i === 0 && !season && (
                        <ConfirmButton action={reopenSeason.bind(null, s.id)} className="btn btn-sm" confirmLabel={a.seasons.reopen}>
                          {a.seasons.reopen}
                        </ConfirmButton>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Section>
          <Section title={a.phones.title}>
            <div className="flex flex-col sm:flex-row gap-4 items-start text-sm">
              <Qr text={origin} size={144} label={origin} />
              <div className="flex flex-col gap-2 min-w-0">
                <p className="text-xs text-muted">{a.phones.hint}</p>
                <code className="font-mono text-sm break-all">{origin}</code>
                {!process.env.VERCEL && (
                  <div className="pt-2 border-t border-line">
                    <div className="font-medium text-xs mb-1">{a.phones.lanTitle}</div>
                    <p className="text-xs text-muted mb-1">
                      {a.phones.lanHint} <code className="font-mono">bun run dev:lan</code> {a.phones.lanHintAfter}
                    </p>
                    {lan.length === 0 ? (
                      <p className="text-xs text-muted">{a.phones.none}</p>
                    ) : (
                      <ul className="flex flex-col gap-0.5">
                        {lan.map((ip) => (
                          <li key={ip} className="font-mono text-xs">
                            http://{ip}:5173
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            </div>
          </Section>
        </div>
      </div>

      <div className="mt-6">
        <PuzzleAdminCard db={db} today={today} t={t} lang={lang} />
      </div>
    </>
  );
}
