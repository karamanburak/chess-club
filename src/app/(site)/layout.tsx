import { Nav } from "@/components/Nav";
import { currentPlayerId, isAdmin } from "@/lib/auth";
import { readDb, STORAGE_KIND } from "@/lib/db";

/** Everything except the TV screen: header, centered column, footer. */
export default async function SiteLayout({ children }: LayoutProps<"/">) {
  const admin = await isAdmin();
  const db = await readDb();
  const club = db.settings.club;
  const meId = await currentPlayerId();
  const mePlayer = meId ? db.players.find((p) => p.id === meId) : undefined;
  const me = mePlayer ? { id: mePlayer.id, name: mePlayer.name, avatar: mePlayer.avatar } : null;
  return (
    <>
      <Nav admin={admin} clubName={club.name} me={me} />
      <main className="mx-auto w-full max-w-6xl px-4 py-8 flex-1 fade-up">{children}</main>
      <footer className="text-center text-xs text-muted py-6 no-print">
        {club.name}
        {STORAGE_KIND === "file" ? (
          <>
            {" "}
            · runs locally · data lives in <code className="font-mono">data/db.json</code> · daily backups in <code className="font-mono">data/backups/</code>
          </>
        ) : (
          <> · daily snapshots kept in the database · export any time from Admin</>
        )}
      </footer>
    </>
  );
}
