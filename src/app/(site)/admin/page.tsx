import os from "node:os";
import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";
import { listBackups, readDb, STORAGE_KIND } from "@/lib/db";
import { adminConfigured, isAdmin } from "@/lib/auth";
import { changePassword, clearMemberCode, closeSeason, createSnapshot, importDatabase, login, logout, mergePlayers, removeBackup, renameSeason, reopenSeason, resetAdminPassword, resetData, restoreBackup, setMemberCode, setOwnerPassword, setupAdmin, signOutEverywhere, startSeason, updateClub, updateSettings } from "@/lib/actions";
import { currentSeason, seasonTable, seasonOverdue } from "@/lib/club";
import { RESET_SCOPES, resetCounts } from "@/lib/reset";
import { requestOrigin } from "@/lib/request-url";
import { checkHealth } from "@/lib/health";
import { Qr } from "@/components/Qr";
import { formatDate, playerMap } from "@/lib/queries";
import { formatDateTime, TIEBREAK_PRESETS } from "@/lib/queries";
import { getT } from "@/lib/lang";
import { fmt, LANG_NAMES, LANGS, plural } from "@/lib/i18n";
import { SubmitButton } from "@/components/SubmitButton";
import { ConfirmButton } from "@/components/ConfirmButton";
import { PageHeader, Section } from "@/components/ui";

export const dynamic = "force-dynamic";

const TONES: Record<string, "error" | "ok"> = {
  wrong: "error",
  locked: "error",
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
  "reset-everything": "ok",
  "reset-history": "ok",
  "reset-tournaments": "ok",
  "reset-sessions": "ok",
  "reset-friendlies": "ok",
  snapshot: "ok",
  merged: "ok",
  everyoneout: "ok",
  recovered: "ok",
  noreset: "error",
  badtoken: "error",
  ownershort: "error",
  ownerset: "ok",
  ownerchanged: "ok",
  recoveredowner: "ok",
};

const ACTIVITY_PREVIEW = 60;

const TABS = ["club", "data", "security"] as const;
type AdminTab = (typeof TABS)[number];
const isTab = (x: unknown): x is AdminTab => typeof x === "string" && (TABS as readonly string[]).includes(x);
const TAB_ICONS: Record<AdminTab, IconName> = { club: "crown", data: "download", security: "shield" };
/** After an action redirects with ?ok=/?error=, open the tab its card lives on. */
const MESSAGE_TAB: Record<string, AdminTab> = {
  saved: "club",
  club: "club",
  season: "club",
  imported: "data",
  restored: "data",
  snapshot: "data",
  merged: "data",
  nofile: "data",
  badjson: "data",
  "reset-everything": "data",
  "reset-history": "data",
  "reset-tournaments": "data",
  "reset-sessions": "data",
  "reset-friendlies": "data",
  changed: "security",
  short: "security",
  mismatch: "security",
  wrong: "security",
  member: "security",
  memberoff: "security",
  codeshort: "security",
  codemismatch: "security",
  everyoneout: "security",
  ownershort: "security",
  ownerset: "security",
  ownerchanged: "security",
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
    const recovering = sp.recover === "1";
    const recoveryOn = !!process.env.ADMIN_RESET_TOKEN?.trim();
    if (recovering) {
      return (
        <div className="max-w-md mx-auto">
          <PageHeader eyebrow={a.signIn.eyebrow} title={a.recover.title} />
          <Section title={a.recover.token}>
            <div className="flex flex-col gap-3">
              {Banner}
              <p className="text-xs text-muted">{a.recover.hint}</p>
              {recoveryOn ? (
                <form action={resetAdminPassword} className="flex flex-col gap-3">
                  <div>
                    <label className="label">{a.recover.token}</label>
                    <input name="token" type="password" required className="w-full font-mono" autoFocus autoComplete="off" />
                  </div>
                  <div>
                    <label className="label">{a.recover.which}</label>
                    <select name="which" defaultValue="admin" className="w-full">
                      <option value="admin">{a.recover.whichAdmin}</option>
                      <option value="owner">{a.recover.whichOwner}</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label">{a.recover.password}</label>
                      <input name="password" type="password" required minLength={4} className="w-full" autoComplete="new-password" />
                    </div>
                    <div>
                      <label className="label">{a.recover.repeat}</label>
                      <input name="confirm" type="password" required minLength={4} className="w-full" autoComplete="new-password" />
                    </div>
                  </div>
                  <SubmitButton pendingText={t.common.saving}>{a.recover.submit}</SubmitButton>
                </form>
              ) : (
                <p className="text-sm text-loss">{a.recover.off}</p>
              )}
              <a href="/admin" className="text-xs text-muted underline self-start">
                {a.recover.back}
              </a>
            </div>
          </Section>
        </div>
      );
    }
    return (
      <div className="max-w-sm mx-auto">
        <PageHeader eyebrow={a.signIn.eyebrow} title={a.signIn.title} />
        <Section title={a.signIn.password}>
          <form action={login} className="flex flex-col gap-3">
            {Banner}
            <input type="hidden" name="next" value={next} />
            <input name="password" type="password" required className="w-full" autoFocus autoComplete="current-password" placeholder={a.signIn.placeholder} />
            <SubmitButton pendingText={a.signIn.checking}>{a.signIn.submit}</SubmitButton>
            <a href="/admin?recover=1" className="text-xs text-muted underline self-start">
              {a.recover.link}
            </a>
          </form>
        </Section>
      </div>
    );
  }

  const backups = await listBackups();
  const lan = lanAddresses();
  const origin = await requestOrigin();
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const who = sp.who === "admin" || sp.who === "guest" ? sp.who : "";
  const showAll = sp.all === "1";
  const filtering = q !== "" || who !== "";
  const matching = [...db.activity].reverse().filter((x) => (who === "" || (who === "admin") === x.admin) && (q === "" || x.text.toLowerCase().includes(q.toLowerCase())));
  const activity = showAll ? matching : matching.slice(0, ACTIVITY_PREVIEW);
  const activityQuery = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    p.set("tab", "security");
    if (q) p.set("q", q);
    if (who) p.set("who", who);
    for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/admin?${s}#activity` : "/admin#activity";
  };
  const sortedPlayers = [...db.players].sort((x, y) => x.name.localeCompare(y.name));
  // Which tab: explicit ?tab=, else the tab the last action's message belongs to, else Club.
  const tab: AdminTab = isTab(sp.tab) ? sp.tab : msgKey && msgKey in MESSAGE_TAB ? MESSAGE_TAB[msgKey] : "club";
  const tabHref = (key: AdminTab) => (key === "club" ? "/admin" : `/admin?tab=${key}`);
  const health = checkHealth(db, a.health.problems);
  const ownerSet = !!db.settings.ownerPasswordHash;
  /** Owner password field for forms that reach a gated action; nothing while no owner password exists. */
  const OwnerField = ownerSet ? (
    <div>
      <label className="label">{a.owner.prompt}</label>
      <input name="owner" type="password" required className="w-full" autoComplete="off" />
    </div>
  ) : null;
  const ownerPrompt = ownerSet ? a.owner.prompt : undefined;
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

      <nav aria-label={a.tabs.label} className="mb-6 flex gap-1 overflow-x-auto rounded-xl border border-line bg-panel p-1 text-sm no-print">
        {TABS.map((key) => (
          <Link
            key={key}
            href={tabHref(key)}
            aria-current={tab === key ? "page" : undefined}
            className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-2 transition-colors ${tab === key ? "bg-panel-2 text-fg font-medium" : "text-muted hover:text-fg"}`}
          >
            <Icon name={TAB_ICONS[key]} className={`h-4 w-4 ${tab === key ? "text-accent" : ""}`} />
            {a.tabs[key]}
            {key === "data" && health.problems.length > 0 && <span className="badge border-loss/40 text-loss">{health.problems.length}</span>}
            {key === "security" && !ownerSet && <span className="h-1.5 w-1.5 rounded-full bg-accent" title={a.owner.notSet} />}
          </Link>
        ))}
      </nav>

      {tab === "club" && (
        <div className="grid gap-6 md:grid-cols-2">
          <div className="col-stack">
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
      )}

      {tab === "data" && (
        <div className="grid gap-6 md:grid-cols-2">
          <div className="col-stack">
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
                  {OwnerField}
                </form>
                <form action={createSnapshot} className="flex flex-col gap-2 pt-3 border-t border-line">
                  <div className="font-medium">{a.backup.takeTitle}</div>
                  <div className="text-xs text-muted">{a.backup.takeHint}</div>
                  <div className="flex gap-2 items-center">
                    <input name="label" maxLength={40} className="flex-1" placeholder={a.backup.takeLabel} autoComplete="off" />
                    <SubmitButton className="btn" pendingText={a.backup.taking}>
                      {a.backup.take}
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
                    <ul className="flex flex-col gap-1 max-h-64 overflow-y-auto">
                      {backups.map((b) => (
                        <li key={b.file} className="flex items-center justify-between gap-2 text-xs">
                          <a href={`/api/backup?snapshot=${encodeURIComponent(b.file)}`} download className="font-mono truncate underline decoration-line hover:decoration-fg" title={a.backup.downloadSnapshot}>
                            {b.file}
                          </a>
                          <span className="text-muted whitespace-nowrap">{(b.size / 1024).toFixed(1)} KB</span>
                          <span className="inline-flex gap-1 shrink-0">
                            <ConfirmButton action={restoreBackup.bind(null, b.file)} className="btn btn-sm" confirmLabel={a.backup.restore} password={ownerPrompt}>
                              {a.backup.restore}
                            </ConfirmButton>
                            <ConfirmButton action={removeBackup.bind(null, b.file)} className="btn btn-sm btn-danger" confirmLabel={a.backup.deleteSnapshot} title={a.backup.deleteSnapshot} password={ownerPrompt}>
                              ×
                            </ConfirmButton>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </Section>
            <Section title={<span className="text-loss">{a.danger.title}</span>}>
              <div className="flex flex-col gap-3 text-sm">
                <p className="text-xs text-muted">{a.danger.hint}</p>
                <ul className="flex flex-col divide-y divide-line">
                  {RESET_SCOPES.map((scope) => {
                    const d = a.danger[scope];
                    const n = resetCounts(db, scope);
                    const empty = n.players + n.games + n.tournaments + n.sessions === 0;
                    const counts = fmt(scope === "everything" ? a.danger.everything.counts : a.danger.counts, { ...n });
                    return (
                      <li key={scope} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                        <div className="min-w-0">
                          <div className="font-medium">{d.title}</div>
                          <div className="text-xs text-muted">{d.hint}</div>
                          <div className="text-xs font-mono text-muted mt-1">{empty ? a.danger.nothing : counts}</div>
                        </div>
                        <ConfirmButton action={resetData.bind(null, scope)} className="btn btn-sm btn-danger shrink-0" confirmLabel={a.danger.confirm} disabled={empty} password={ownerPrompt}>
                          {d.button}
                        </ConfirmButton>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </Section>
          </div>
          <div className="col-stack">
            <Section
              title={a.health.title}
              right={
                health.problems.length === 0 ? (
                  <span className="badge border-win/40 text-win">{a.health.ok}</span>
                ) : (
                  <span className="badge border-loss/40 text-loss">{plural(health.problems.length, a.health.problemsN)}</span>
                )
              }
            >
              <div className="flex flex-col gap-3 text-sm">
                <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted">
                  <li>{fmt(a.health.players, { n: health.summary.players, active: health.summary.activePlayers, pin: health.summary.withPin })}</li>
                  <li>{fmt(a.health.games, { n: health.summary.games, open: health.summary.open })}</li>
                  <li>{fmt(a.health.tournaments, { n: health.summary.tournaments, running: health.summary.runningTournaments })}</li>
                  <li>{fmt(a.health.sessions, { n: health.summary.sessions, open: health.summary.openSessions })}</li>
                </ul>
                {health.problems.length === 0 ? (
                  <p className="text-xs text-muted">{a.health.hint}</p>
                ) : (
                  <ul className="flex flex-col gap-1.5 max-h-56 overflow-y-auto rounded-xl border border-loss/30 bg-loss/5 p-3 text-xs">
                    {health.problems.slice(0, 60).map((x, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-loss shrink-0">•</span>
                        <span>{x.text}</span>
                      </li>
                    ))}
                    {health.problems.length > 60 && <li className="text-muted">…</li>}
                  </ul>
                )}
                {health.problems.length > 0 && <p className="text-xs text-muted">{a.health.fixHint}</p>}
              </div>
            </Section>
            <Section title={a.merge.title}>
              <div className="flex flex-col gap-3 text-sm">
                <p className="text-xs text-muted">{a.merge.hint}</p>
                {sortedPlayers.length < 2 ? (
                  <p className="text-xs text-muted">{a.merge.tooFew}</p>
                ) : (
                  <form action={mergePlayers} className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label">{a.merge.from}</label>
                      <select name="fromId" required className="w-full" defaultValue="">
                        <option value="" disabled>
                          —
                        </option>
                        {sortedPlayers.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} · {p.rating} · {plural(p.gamesPlayed, t.common.gamesN)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label">{a.merge.into}</label>
                      <select name="intoId" required className="w-full" defaultValue="">
                        <option value="" disabled>
                          —
                        </option>
                        {sortedPlayers.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} · {p.rating} · {plural(p.gamesPlayed, t.common.gamesN)}
                          </option>
                        ))}
                      </select>
                    </div>
                    {OwnerField && <div className="col-span-2">{OwnerField}</div>}
                    <SubmitButton className="btn col-span-2" pendingText="…">
                      {a.merge.submit}
                    </SubmitButton>
                  </form>
                )}
              </div>
            </Section>
          </div>
        </div>
      )}

      {tab === "security" && (
        <div className="grid gap-6 md:grid-cols-2">
          <div className="col-stack">
            <Section title={a.owner.title}>
              <form action={setOwnerPassword} className="flex flex-col gap-3">
                <div className={`rounded-xl border px-4 py-2.5 text-xs ${ownerSet ? "border-win/40 bg-win/5 text-muted" : "border-accent/50 bg-accent/5 text-fg"}`}>
                  {ownerSet ? a.owner.setHint : a.owner.notSet}
                </div>
                {!ownerSet && <p className="text-xs text-muted">{a.owner.notSetHint}</p>}
                {ownerSet && (
                  <div>
                    <label className="label">{a.owner.current}</label>
                    <input name="current" type="password" required className="w-full" autoComplete="off" />
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">{a.owner.next}</label>
                    <input name="password" type="password" required minLength={6} className="w-full" autoComplete="new-password" />
                  </div>
                  <div>
                    <label className="label">{a.owner.repeat}</label>
                    <input name="confirm" type="password" required minLength={6} className="w-full" autoComplete="new-password" />
                  </div>
                </div>
                <SubmitButton className={ownerSet ? "btn" : "btn btn-primary"} pendingText={t.common.saving}>
                  {ownerSet ? a.owner.change : a.owner.set}
                </SubmitButton>
              </form>
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
                {OwnerField}
                <SubmitButton className="btn" pendingText={t.common.saving}>
                  {a.password.submit}
                </SubmitButton>
                <p className="text-xs text-muted">{a.sessions.passwordHint}</p>
              </form>
            </Section>
            <Section title={a.member.title}>
              <div className="flex flex-col gap-3 text-sm">
                <p className="text-muted text-xs">{a.member.hint}</p>
                <div className={`rounded-xl border px-4 py-2.5 flex items-center justify-between gap-3 ${db.settings.memberCodeHash ? "border-win/40 bg-win/5" : "border-line"}`}>
                  <span className="font-medium">{db.settings.memberCodeHash ? a.member.on : a.member.off}</span>
                  {db.settings.memberCodeHash && (
                    <ConfirmButton action={clearMemberCode} className="btn btn-sm" confirmLabel={a.member.turnOff} password={ownerPrompt}>
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
                  {OwnerField && <div className="col-span-2">{OwnerField}</div>}
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
                <ConfirmButton action={signOutEverywhere} className="btn btn-danger self-start" confirmLabel={a.sessions.confirm} password={ownerPrompt}>
                  {a.sessions.button}
                </ConfirmButton>
              </div>
            </Section>
            <Section
              title={<span id="activity">{a.activity.title}</span>}
              flush
              right={
                <span className="text-xs text-muted">
                  {filtering ? fmt(a.activity.matching, { n: matching.length, total: db.activity.length }) : fmt(a.activity.lastOf, { n: activity.length, total: db.activity.length })}
                </span>
              }
            >
              <form method="get" action="/admin#activity" className="flex flex-wrap gap-2 px-4 pb-3 text-sm">
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
      )}
    </>
  );
}
