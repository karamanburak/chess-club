import { createSnapshot, importDatabase, mergePlayers, removeBackup, resetData, restoreBackup } from "@/lib/actions";
import { listBackups, STORAGE_KIND } from "@/lib/db";
import type { HealthReport } from "@/lib/health";
import { fmt, plural } from "@/lib/i18n";
import { getT } from "@/lib/lang";
import { pickableWithGames } from "@/lib/pick";
import { RESET_SCOPES, resetCounts } from "@/lib/reset";
import type { Database } from "@/lib/types";
import { ConfirmButton } from "@/components/ConfirmButton";
import { Icon } from "@/components/icons";
import { MergePlayersFields } from "@/components/MergePlayersFields";
import { RecordPastGame } from "@/components/RecordPastGame";
import { SubmitButton } from "@/components/SubmitButton";
import { Section } from "@/components/ui";

/** Admin → Data: backups and snapshots, the danger zone, data health, merging duplicates, backdated games. */
export async function AdminDataTab({ db, health }: { db: Database; health: HealthReport }) {
  const { t } = await getT();
  const a = t.admin;
  const backups = await listBackups();

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="col-stack">
        <Section title={a.backup.title}>
          <div className="flex flex-col gap-4 text-sm">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium">{a.backup.download}</div>
                  <div className="text-xs text-muted">{a.backup.downloadHint}</div>
                </div>
                <a href="/api/backup" className="btn btn-primary" download>
                  <Icon name="download" className="h-4 w-4" /> {a.backup.downloadButton}
                </a>
              </div>
              <a href="/api/backup?pins=1" className="self-start text-xs text-muted underline decoration-line hover:text-fg hover:decoration-fg" download>
                {a.backup.downloadPins}
              </a>
              <p className="text-xs text-muted">{a.backup.downloadPinsHint}</p>
            </div>
            <form action={importDatabase} className="flex flex-col gap-2 pt-3 border-t border-line">
              <div className="font-medium" id="f-import-title">{a.backup.importTitle}</div>
              <div className="text-xs text-muted">{a.backup.importHint}</div>
              <div className="flex gap-2 items-center">
                <input type="file" name="file" accept="application/json,.json" required className="text-xs flex-1" aria-labelledby="f-import-title" />
                <SubmitButton className="btn" pendingText={a.backup.importing}>
                  {a.backup.importButton}
                </SubmitButton>
              </div>
            </form>
            <form action={createSnapshot} className="flex flex-col gap-2 pt-3 border-t border-line">
              <div className="font-medium">{a.backup.takeTitle}</div>
              <div className="text-xs text-muted">{a.backup.takeHint}</div>
              <div className="flex gap-2 items-center">
                <input name="label" maxLength={40} className="flex-1" placeholder={a.backup.takeLabel} aria-label={a.backup.takeLabel} autoComplete="off" />
                <SubmitButton className="btn" pendingText={a.backup.taking}>
                  {a.backup.take}
                </SubmitButton>
              </div>
            </form>
            <div className="pt-3 border-t border-line">
              <div className="font-medium mb-1">{a.backup.snapshots}</div>
              <div className="text-xs text-muted mb-2">
                {a.backup.snapshotsHintBefore}{" "}
                {STORAGE_KIND === "postgres" ? (
                  a.backup.inDatabase
                ) : (
                  <>
                    {a.backup.inFolder} <code className="font-mono">data/backups/</code>
                  </>
                )}
                {a.backup.snapshotsHintAfter}
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
                        <ConfirmButton action={restoreBackup.bind(null, b.file)} className="btn btn-sm" confirmLabel={a.backup.restore}>
                          {a.backup.restore}
                        </ConfirmButton>
                        <ConfirmButton action={removeBackup.bind(null, b.file)} className="btn btn-sm btn-danger" confirmLabel={a.backup.deleteSnapshot} title={a.backup.deleteSnapshot}>
                          <Icon name="close" className="h-3.5 w-3.5" />
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
                    <ConfirmButton action={resetData.bind(null, scope)} className="btn btn-sm btn-danger shrink-0" confirmLabel={a.danger.confirm} disabled={empty}>
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
                    <span className="text-loss shrink-0" aria-hidden>
                      •
                    </span>
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
            {db.players.length < 2 ? (
              <p className="text-xs text-muted">{a.merge.tooFew}</p>
            ) : (
              <form action={mergePlayers} className="flex flex-col gap-3">
                <MergePlayersFields players={pickableWithGames(db)} />
                <SubmitButton className="btn" pendingText="…">
                  {a.merge.submit}
                </SubmitButton>
              </form>
            )}
          </div>
        </Section>
        <Section title={t.games.past.title}>
          <RecordPastGame players={db.players} />
        </Section>
      </div>
    </div>
  );
}
