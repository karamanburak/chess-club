import os from "node:os";
import { Icon } from "@/components/icons";
import { listBackups, readDb, STORAGE_KIND } from "@/lib/db";
import { adminConfigured, isAdmin } from "@/lib/auth";
import { changePassword, clearMemberCode, closeSeason, importDatabase, login, logout, renameSeason, reopenSeason, restoreBackup, setMemberCode, setupAdmin, startSeason, updateClub, updateSettings } from "@/lib/actions";
import { currentSeason, seasonTable } from "@/lib/club";
import { formatDate, playerMap } from "@/lib/queries";
import { formatDateTime, TIEBREAK_PRESETS } from "@/lib/queries";
import { SubmitButton } from "@/components/SubmitButton";
import { ConfirmButton } from "@/components/ConfirmButton";
import { PageHeader, Section } from "@/components/ui";

export const dynamic = "force-dynamic";

const messages: Record<string, { tone: "error" | "ok"; text: string }> = {
  wrong: { tone: "error", text: "Wrong password." },
  short: { tone: "error", text: "Password must be at least 4 characters." },
  mismatch: { tone: "error", text: "Passwords do not match." },
  nofile: { tone: "error", text: "Choose a JSON file first." },
  badjson: { tone: "error", text: "That file is not a valid chess-club database." },
  changed: { tone: "ok", text: "Password changed." },
  saved: { tone: "ok", text: "Settings saved." },
  imported: { tone: "ok", text: "Database imported. The previous one was saved to data/backups." },
  restored: { tone: "ok", text: "Backup restored. The previous state was saved to data/backups." },
  club: { tone: "ok", text: "Club identity saved." },
  member: { tone: "ok", text: "Member code saved. Everyone will be asked for it once per device." },
  memberoff: { tone: "ok", text: "Member code turned off. The club is open again." },
  codeshort: { tone: "error", text: "The member code needs at least 4 characters." },
  codemismatch: { tone: "error", text: "The two member codes do not match." },
  season: { tone: "ok", text: "New season started." },
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
  const msgKey = typeof sp.error === "string" ? sp.error : typeof sp.ok === "string" ? sp.ok : null;
  const msg = msgKey ? messages[msgKey] : null;
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
        <PageHeader eyebrow="First-time setup" title="Create admin password" subtitle={<span>Only the admin can edit or delete players, rounds and tournaments. Everyone can enter results.</span>} />
        <Section title="Choose a password">
          <form action={setupAdmin} className="flex flex-col gap-3">
            {Banner}
            <div>
              <label className="label">Password</label>
              <input name="password" type="password" required minLength={4} className="w-full" autoFocus autoComplete="new-password" />
            </div>
            <div>
              <label className="label">Repeat password</label>
              <input name="confirm" type="password" required minLength={4} className="w-full" autoComplete="new-password" />
            </div>
            <p className="text-xs text-muted">
              Stored as a salted hash in <code className="font-mono">data/db.json</code>. Nothing leaves this machine.
            </p>
            <SubmitButton pendingText="Saving…">Set password & sign in</SubmitButton>
          </form>
        </Section>
      </div>
    );
  }

  if (!admin) {
    return (
      <div className="max-w-sm mx-auto">
        <PageHeader eyebrow="Restricted" title="Admin sign-in" />
        <Section title="Password">
          <form action={login} className="flex flex-col gap-3">
            {Banner}
            <input type="hidden" name="next" value={next} />
            <input name="password" type="password" required className="w-full" autoFocus autoComplete="current-password" placeholder="Admin password" />
            <SubmitButton pendingText="Checking…">Sign in</SubmitButton>
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

  return (
    <>
      <PageHeader
        eyebrow="Signed in"
        title="Admin"
        subtitle={<span>Edit and delete controls are now visible on player, tournament and club-night pages.</span>}
        actions={
          <form action={logout}>
            <SubmitButton className="btn">Sign out</SubmitButton>
          </form>
        }
      />
      {Banner && <div className="mb-6 max-w-xl">{Banner}</div>}

      <div className="grid gap-6 md:grid-cols-2 mb-6">
        <Section title="Club identity">
          <form action={updateClub} className="flex flex-col gap-3">
            <div>
              <label className="label">Club name</label>
              <input name="name" defaultValue={club.name} required className="w-full" />
            </div>
            <div>
              <label className="label">Tagline (optional, used as the browser description only)</label>
              <input name="motto" defaultValue={club.motto} className="w-full" placeholder="The home page and TV show the chess quote of the day instead." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Founded</label>
                <input name="founded" defaultValue={club.founded} className="w-full" placeholder="e.g. 2024" />
              </div>
              <div>
                <label className="label">Next club night</label>
                <input name="nextNight" type="date" defaultValue={club.nextNight} className="w-full" />
              </div>
            </div>
            <div>
              <label className="label">Where & when</label>
              <input name="meets" defaultValue={club.meets} className="w-full" placeholder="e.g. Thursdays 18:00 · Room 3.14" />
            </div>
            <div>
              <label className="label">Notice board</label>
              <textarea name="announcement" defaultValue={club.announcement} maxLength={300} rows={2} className="w-full" placeholder="Shown on the home page and the TV screen." />
            </div>
            <SubmitButton className="btn" pendingText="Saving…">
              Save identity
            </SubmitButton>
          </form>
        </Section>

        <Section title="Seasons" right={<a id="seasons" href="/hall-of-fame" className="btn btn-sm btn-ghost">Hall of Fame →</a>}>
          <div className="flex flex-col gap-4 text-sm">
            {season ? (
              <div className="rounded-xl border border-accent/40 bg-accent/5 px-4 py-3 flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium">{season.name}</div>
                    <div className="text-xs text-muted">
                      running since {formatDate(season.start)}
                      {seasonTop ? ` · leader ${names.get(seasonTop.playerId)?.name ?? "?"} with ${seasonTop.points} pts` : " · no games yet"}
                    </div>
                  </div>
                  <ConfirmButton action={closeSeason.bind(null, season.id)} className="btn btn-sm" confirmLabel="Close & crown">
                    Close season
                  </ConfirmButton>
                </div>
                <form action={renameSeason.bind(null, season.id)} className="flex gap-2">
                  <input name="name" defaultValue={season.name} className="flex-1" />
                  <SubmitButton className="btn btn-sm" pendingText="…">
                    Rename
                  </SubmitButton>
                </form>
                <p className="text-xs text-muted">Closing ends the season today and crowns whoever tops its table. Points: 1 per win, ½ per draw, across every rated-able game.</p>
              </div>
            ) : (
              <form action={startSeason} className="flex flex-col gap-2 rounded-xl border border-line px-4 py-3">
                <div className="font-medium">Start the next season</div>
                <div className="grid grid-cols-2 gap-2">
                  <input name="name" placeholder={`Season ${today.slice(0, 4)}`} />
                  <input name="start" type="date" defaultValue={today} />
                </div>
                <SubmitButton className="btn btn-primary btn-sm" pendingText="Starting…">
                  Start season
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
                        {formatDate(s.start)} – {s.end ? formatDate(s.end) : ""} · champion {s.championId ? (names.get(s.championId)?.name ?? "?") : "no champion"}
                      </span>
                    </span>
                    {i === 0 && !season && (
                      <ConfirmButton action={reopenSeason.bind(null, s.id)} className="btn btn-sm" confirmLabel="Reopen">
                        Reopen
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
        <Section title="Backup & restore">
          <div className="flex flex-col gap-4 text-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-medium">Download database</div>
                <div className="text-xs text-muted">The whole club as one JSON file.</div>
              </div>
              <a href="/api/backup" className="btn btn-primary" download>
                <Icon name="download" className="h-4 w-4" /> Download
              </a>
            </div>
            <form action={importDatabase} className="flex flex-col gap-2 pt-3 border-t border-line">
              <div className="font-medium">Import a database file</div>
              <div className="text-xs text-muted">Replaces everything except the admin password. The current data is backed up first.</div>
              <div className="flex gap-2 items-center">
                <input type="file" name="file" accept="application/json,.json" required className="text-xs flex-1" />
                <SubmitButton className="btn" pendingText="Importing…">
                  Import
                </SubmitButton>
              </div>
            </form>
            <div className="pt-3 border-t border-line">
              <div className="font-medium mb-1">Automatic daily snapshots</div>
              <div className="text-xs text-muted mb-2">
                One copy per day {STORAGE_KIND === "postgres" ? "in the database" : <>in <code className="font-mono">data/backups/</code></>}, last 30 kept.
              </div>
              {backups.length === 0 ? (
                <p className="text-xs text-muted">No snapshots yet. The first one is written on the next change.</p>
              ) : (
                <ul className="flex flex-col gap-1 max-h-48 overflow-y-auto">
                  {backups.map((b) => (
                    <li key={b.file} className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-mono truncate">{b.file}</span>
                      <span className="text-muted whitespace-nowrap">{(b.size / 1024).toFixed(1)} KB</span>
                      <ConfirmButton action={restoreBackup.bind(null, b.file)} className="btn btn-sm" confirmLabel="Restore">
                        Restore
                      </ConfirmButton>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Section>

        <div className="col-stack">
          <Section title="Club settings">
            <form action={updateSettings} className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Starting Elo for new players</label>
                  <input name="startRating" type="number" min={100} max={3000} defaultValue={db.settings.startRating} className="w-full" />
                </div>
                <div>
                  <label className="label">Bye scores</label>
                  <select name="byePoints" defaultValue={String(db.settings.byePoints)} className="w-full">
                    <option value="1">1 point</option>
                    <option value="0.5">½ point</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="label">Default tiebreaks</label>
                <select name="tiebreaks" defaultValue={presetKey} className="w-full">
                  {TIEBREAK_PRESETS.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              <SubmitButton className="btn" pendingText="Saving…">
                Save
              </SubmitButton>
            </form>
          </Section>

          {!process.env.VERCEL && (
          <Section title="Phones on the same Wi-Fi">
            <p className="text-sm text-muted mb-2">
              Still local: nothing leaves your network. Start the server with <code className="font-mono">bun run dev:lan</code> and colleagues can open one of these on their phone to enter results:
            </p>
            {lan.length === 0 ? (
              <p className="text-xs text-muted">No network address found.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {lan.map((ip) => (
                  <li key={ip} className="font-mono text-sm">
                    http://{ip}:3000
                  </li>
                ))}
              </ul>
            )}
          </Section>
          )}

          <Section title="Recent activity" flush right={<span className="text-xs text-muted">last {activity.length} of {db.activity.length}</span>}>
            {activity.length === 0 ? (
              <p className="text-sm text-muted px-4 py-3">Nothing logged yet. Every result, pairing and edit shows up here.</p>
            ) : (
              <ul className="max-h-80 overflow-y-auto divide-y divide-line text-sm">
                {activity.map((a) => (
                  <li key={a.id} className="flex items-start gap-3 px-4 py-2">
                    <span className="text-xs text-muted font-mono whitespace-nowrap pt-0.5">{formatDateTime(a.at)}</span>
                    <span className="flex-1 min-w-0">{a.text}</span>
                    <span className={`badge shrink-0 ${a.admin ? "border-win/40 text-win" : "border-line text-muted"}`} title={a.admin ? "Done while signed in as admin" : "Done by someone on the network without admin sign-in"}>
                      {a.admin ? "admin" : "guest"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Member code">
            <div className="flex flex-col gap-3 text-sm">
              <p className="text-muted text-xs">
                One shared code for the whole club, like a Wi-Fi password. With a code set, visitors see a join screen once and are remembered for 90 days on that device.
                Without one, anyone who knows the address can use the club. Admins pass regardless.
              </p>
              <div className={`rounded-xl border px-4 py-2.5 flex items-center justify-between gap-3 ${db.settings.memberCodeHash ? "border-win/40 bg-win/5" : "border-line"}`}>
                <span className="font-medium">{db.settings.memberCodeHash ? "Code is on" : "No code · open club"}</span>
                {db.settings.memberCodeHash && (
                  <ConfirmButton action={clearMemberCode} className="btn btn-sm" confirmLabel="Turn off">
                    Turn off
                  </ConfirmButton>
                )}
              </div>
              <form action={setMemberCode} className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">{db.settings.memberCodeHash ? "New code" : "Code"}</label>
                  <input name="code" type="text" required minLength={4} className="w-full" autoComplete="off" placeholder="e.g. KALE2026" />
                </div>
                <div>
                  <label className="label">Repeat</label>
                  <input name="confirm" type="text" required minLength={4} className="w-full" autoComplete="off" />
                </div>
                <SubmitButton className="btn col-span-2" pendingText="Saving…">
                  {db.settings.memberCodeHash ? "Change code (signs everyone out)" : "Turn code on"}
                </SubmitButton>
              </form>
            </div>
          </Section>

          <Section title="Change password">
            <form action={changePassword} className="flex flex-col gap-3">
              <div>
                <label className="label">Current password</label>
                <input name="current" type="password" required className="w-full" autoComplete="current-password" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">New password</label>
                  <input name="password" type="password" required minLength={4} className="w-full" autoComplete="new-password" />
                </div>
                <div>
                  <label className="label">Repeat</label>
                  <input name="confirm" type="password" required minLength={4} className="w-full" autoComplete="new-password" />
                </div>
              </div>
              <SubmitButton className="btn" pendingText="Saving…">
                Change password
              </SubmitButton>
            </form>
          </Section>
        </div>
      </div>
    </>
  );
}
