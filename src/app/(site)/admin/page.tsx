import os from "node:os";
import { Icon } from "@/components/icons";
import { listBackups, readDb, STORAGE_KIND } from "@/lib/db";
import { adminConfigured, isAdmin } from "@/lib/auth";
import { changePassword, clearMemberCode, closeSeason, importDatabase, login, logout, renameSeason, reopenSeason, restoreBackup, setMemberCode, setupAdmin, startSeason, updateClub, updateSettings } from "@/lib/actions";
import { currentSeason, seasonTable, seasonOverdue } from "@/lib/club";
import { formatDate, playerMap } from "@/lib/queries";
import { formatDateTime, TIEBREAK_PRESETS } from "@/lib/queries";
import { getT } from "@/lib/lang";
import { fmt, LANG_NAMES, LANGS } from "@/lib/i18n";
import { SubmitButton } from "@/components/SubmitButton";
import { ConfirmButton } from "@/components/ConfirmButton";
import { PageHeader, Section } from "@/components/ui";

export const dynamic = "force-dynamic";

const TONES: Record<string, "error" | "ok"> = {
  wrong: "error",
  short: "error",
  mismatch: "error",
  nofile: "error",
  badjson: "error",
  changed: "ok",
  saved: "ok",
  imported: "ok",
  restored: "ok",
  club: "ok",
  member: "ok",
  memberoff: "ok",
  codeshort: "error",
  codemismatch: "error",
  season: "ok",
};

function lanAddresses(): string[] {
  const out: string[] = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list ?? []) if (i.family === "IPv4" && !i.internal) out.push(i.address);
  }
  return out;
}

export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  const sp = await searchParams;
  const { t, lang } = await getT();
  const a = t.admin;
  const msgKey = typeof sp.error === "string" ? sp.error : typeof sp.ok === "string" ? sp.ok : null;
  const msg = msgKey && msgKey in TONES ? { tone: TONES[msgKey], text: a.messages[msgKey as keyof typeof a.messages] } : null;
  const next = typeof sp.next === "string" ? sp.next : "";
  const configured = await adminConfigured();
  const admin = await isAdmin();
  const db = await readDb();

  const Banner = msg ? (
    <div className={`rounded-lg px-3 py-2 text-sm border ${msg.tone === "error" ? "border-loss/40 bg-loss/10 text-loss" : "border-win/40 bg-win/10 text-win"}`}>{msg.text}</div>
  ) : null;

  if (!configured) {
    return (
      <div className="max-w-md mx-auto">
        <PageHeader eyebrow={a.setup.eyebrow} title={a.setup.title} subtitle={<span>{a.setup.subtitle}</span>} />
        <Section title={a.setup.choose}>
          <form action={setupAdmin} className="flex flex-col gap-3">
            {Banner}
            <div>
              <label className="label">{a.setup.password}</label>
              <input name="password" type="password" required minLength={4} className="w-full" autoFocus autoComplete="new-password" />
            </div>
            <div>
              <label className="label">{a.setup.repeat}</label>
              <input name="confirm" type="password" required minLength={4} className="w-full" autoComplete="new-password" />
            </div>
            <p className="text-xs text-muted">
              {a.setup.stored} <code className="font-mono">data/db.json</code>. {a.setup.nothingLeaves}
            </p>
            <SubmitButton pendingText={t.common.saving}>{a.setup.submit}</SubmitButton>
          </form>
        </Section>
      </div>
    );
  }

  if (!admin) {
    return (
      <div className="max-w-sm mx-auto">
        <PageHeader eyebrow={a.signIn.eyebrow} title={a.signIn.title} />
        <Section title={a.signIn.password}>
          <form action={login} className="flex flex-col gap-3">
            {Banner}
            <input type="hidden" name="next" value={next} />
            <input name="password" type="password" required className="w-full" autoFocus autoComplete="current-password" placeholder={a.signIn.placeholder} />
            <SubmitButton pendingText={a.signIn.checking}>{a.signIn.submit}</SubmitButton>
          </form>
        </Section>
      </div>
    );
  }

  const backups = await listBackups();
  const lan = lanAddresses();
  const activity = [...db.activity].reverse().slice(0, 60);
  const club = db.settings.club;
  const season = currentSeason(db);
  const seasonTop = season ? seasonTable(db, season)[0] : null;
  const pastSeasons = db.seasons.filter((s) => s.end).sort((a, b) => b.start.localeCompare(a.start));
  const names = playerMap(db);
  const today = new Date().toISOString().slice(0, 10);
  const presetKey = TIEBREAK_PRESETS.find((p) => p.order.join() === db.settings.defaultTiebreaks.join())?.key ?? "club";
  const presetLabel = (key: string, fallback: string) => (key in a.settings.tiebreakPresets ? a.settings.tiebreakPresets[key as keyof typeof a.settings.tiebreakPresets] : fallback);

  return (
    <>
      <PageHeader
        eyebrow={a.eyebrow}
        title={a.title}
        subtitle={<span>{a.subtitle}</span>}
        actions={
          <form action={logout}>
            <SubmitButton className="btn">{a.signOut}</SubmitButton>
          </form>
        }
      />
      {Banner && <div className="mb-6 max-w-xl">{Banner}</div>}

      <div className="grid gap-6 md:grid-cols-2 mb-6">
        <Section title={a.identity.title}>
          <form action={updateClub} className="flex flex-col gap-3">
            <div>
              <label className="label">{a.identity.name}</label>
              <input name="name" defaultValue={club.name} required className="w-full" />
            </div>
            <div>
              <label className="label">{a.identity.nextNight}</label>
              <input name="nextNight" type="date" defaultValue={club.nextNight} className="w-full" />
            </div>
            <div>
              <label className="label">{a.identity.meets}</label>
              <input name="meets" defaultValue={club.meets} className="w-full" placeholder={a.identity.meetsPlaceholder} />
            </div>
            <div>
              <label className="label">{a.identity.notice}</label>
              <textarea name="announcement" defaultValue={club.announcement} maxLength={300} rows={2} className="w-full" placeholder={a.identity.noticePlaceholder} />
            </div>
            <SubmitButton className="btn" pendingText={t.common.saving}>
              {a.identity.save}
            </SubmitButton>
          </form>
        </Section>

        <Section title={a.seasons.title} right={<a id="seasons" href="/hall-of-fame" className="btn btn-sm btn-ghost">{a.seasons.hallOfFame}</a>}>
          <div className="flex flex-col gap-4 text-sm">
            {season ? (
              <div className="rounded-xl border border-accent/40 bg-accent/5 px-4 py-3 flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium">{season.name}</div>
                    <div className="text-xs text-muted">
                      {fmt(a.seasons.runningSince, { date: formatDate(season.start, lang) })}
                      {seasonTop ? fmt(a.seasons.leader, { name: names.get(seasonTop.playerId)?.name ?? "?", points: seasonTop.points }) : a.seasons.noGamesYet}
                    </div>
                  </div>
                  <ConfirmButton action={closeSeason.bind(null, season.id)} className="btn btn-sm" confirmLabel={a.seasons.closeConfirm}>
                    {a.seasons.close}
                  </ConfirmButton>
                </div>
                <form action={renameSeason.bind(null, season.id)} className="flex gap-2">
                  <input name="name" defaultValue={season.name} className="flex-1" />
                  <SubmitButton className="btn btn-sm" pendingText="…">
                    {a.seasons.rename}
                  </SubmitButton>
                </form>
                {seasonOverdue(season) && (
                  <p className="text-xs text-accent">{fmt(a.seasons.overdue, { months: seasonOverdue(season) })}</p>
                )}
                <p className="text-xs text-muted">{a.seasons.closingHint}</p>
              </div>
            ) : (
              <form action={startSeason} className="flex flex-col gap-2 rounded-xl border border-line px-4 py-3">
                <div className="font-medium">{a.seasons.startNext}</div>
                <div className="grid grid-cols-2 gap-2">
                  <input name="name" placeholder={fmt(a.seasons.namePlaceholder, { year: today.slice(0, 4) })} />
                  <input name="start" type="date" defaultValue={today} />
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
                        {formatDate(s.start, lang)} – {s.end ? formatDate(s.end, lang) : ""} · {s.championId ? fmt(a.seasons.champion, { name: names.get(s.championId)?.name ?? "?" }) : a.seasons.noChampion}
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
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Section title={a.backup.title}>
          <div className="flex flex-col gap-4 text-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-medium">{a.backup.download}</div>
                <div className="text-xs text-muted">{a.backup.downloadHint}</div>
              </div>
              <a href="/api/backup" className="btn btn-primary" download>
                <Icon name="download" className="h-4 w-4" /> {a.backup.downloadButton}
              </a>
            </div>
            <form action={importDatabase} className="flex flex-col gap-2 pt-3 border-t border-line">
              <div className="font-medium">{a.backup.importTitle}</div>
              <div className="text-xs text-muted">{a.backup.importHint}</div>
              <div className="flex gap-2 items-center">
                <input type="file" name="file" accept="application/json,.json" required className="text-xs flex-1" />
                <SubmitButton className="btn" pendingText={a.backup.importing}>
                  {a.backup.importButton}
                </SubmitButton>
              </div>
            </form>
            <div className="pt-3 border-t border-line">
              <div className="font-medium mb-1">{a.backup.snapshots}</div>
              <div className="text-xs text-muted mb-2">
                {a.backup.snapshotsHintBefore} {STORAGE_KIND === "postgres" ? a.backup.inDatabase : <>{a.backup.inFolder} <code className="font-mono">data/backups/</code></>}{a.backup.snapshotsHintAfter}
              </div>
              {backups.length === 0 ? (
                <p className="text-xs text-muted">{a.backup.noSnapshots}</p>
              ) : (
                <ul className="flex flex-col gap-1 max-h-48 overflow-y-auto">
                  {backups.map((b) => (
                    <li key={b.file} className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-mono truncate">{b.file}</span>
                      <span className="text-muted whitespace-nowrap">{(b.size / 1024).toFixed(1)} KB</span>
                      <ConfirmButton action={restoreBackup.bind(null, b.file)} className="btn btn-sm" confirmLabel={a.backup.restore}>
                        {a.backup.restore}
                      </ConfirmButton>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Section>

        <div className="col-stack">
          <Section title={a.settings.title}>
            <form action={updateSettings} className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">{a.settings.startRating}</label>
                  <input name="startRating" type="number" min={100} max={3000} defaultValue={db.settings.startRating} className="w-full" />
                </div>
                <div>
                  <label className="label">{a.settings.byePoints}</label>
                  <select name="byePoints" defaultValue={String(db.settings.byePoints)} className="w-full">
                    <option value="1">{a.settings.onePoint}</option>
                    <option value="0.5">{a.settings.halfPoint}</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="label">{a.settings.tiebreaks}</label>
                <select name="tiebreaks" defaultValue={presetKey} className="w-full">
                  {TIEBREAK_PRESETS.map((p) => (
                    <option key={p.key} value={p.key}>
                      {presetLabel(p.key, p.label)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">{a.settings.language}</label>
                <select name="language" defaultValue={db.settings.language ?? "en"} className="w-full">
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

          {!process.env.VERCEL && (
          <Section title={a.lan.title}>
            <p className="text-sm text-muted mb-2">
              {a.lan.hintBefore} <code className="font-mono">bun run dev:lan</code> {a.lan.hintAfter}
            </p>
            {lan.length === 0 ? (
              <p className="text-xs text-muted">{a.lan.none}</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {lan.map((ip) => (
                  <li key={ip} className="font-mono text-sm">
                    http://{ip}:5173
                  </li>
                ))}
              </ul>
            )}
          </Section>
          )}

          <Section title={a.activity.title} flush right={<span className="text-xs text-muted">{fmt(a.activity.lastOf, { n: activity.length, total: db.activity.length })}</span>}>
            {activity.length === 0 ? (
              <p className="text-sm text-muted px-4 py-3">{a.activity.empty}</p>
            ) : (
              <ul className="max-h-80 overflow-y-auto divide-y divide-line text-sm">
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
          </Section>

          <Section title={a.member.title}>
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
                  <label className="label">{db.settings.memberCodeHash ? a.member.newCode : a.member.code}</label>
                  <input name="code" type="text" required minLength={4} className="w-full" autoComplete="off" placeholder={a.member.codePlaceholder} />
                </div>
                <div>
                  <label className="label">{a.member.repeat}</label>
                  <input name="confirm" type="text" required minLength={4} className="w-full" autoComplete="off" />
                </div>
                <SubmitButton className="btn col-span-2" pendingText={t.common.saving}>
                  {db.settings.memberCodeHash ? a.member.change : a.member.turnOn}
                </SubmitButton>
              </form>
            </div>
          </Section>

          <Section title={a.password.title}>
            <form action={changePassword} className="flex flex-col gap-3">
              <div>
                <label className="label">{a.password.current}</label>
                <input name="current" type="password" required className="w-full" autoComplete="current-password" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">{a.password.next}</label>
                  <input name="password" type="password" required minLength={4} className="w-full" autoComplete="new-password" />
                </div>
                <div>
                  <label className="label">{a.password.repeat}</label>
                  <input name="confirm" type="password" required minLength={4} className="w-full" autoComplete="new-password" />
                </div>
              </div>
              <SubmitButton className="btn" pendingText={t.common.saving}>
                {a.password.submit}
              </SubmitButton>
            </form>
          </Section>
        </div>
      </div>
    </>
  );
}
