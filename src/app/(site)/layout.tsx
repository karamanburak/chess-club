import { AdminBanner } from "@/components/AdminBanner";
import { Nav } from "@/components/Nav";
import { currentPlayerId, isAdmin } from "@/lib/auth";
import { readDb } from "@/lib/db";
import { pendingFor } from "@/lib/challenges";

/** Everything except the TV screen: header, centered column, footer. */
export default async function SiteLayout({ children }: LayoutProps<"/">) {
  const admin = await isAdmin();
  const db = await readDb();
  const club = db.settings.club;
  const meId = await currentPlayerId();
  const mePlayer = meId ? db.players.find((p) => p.id === meId) : undefined;
  const me = mePlayer ? { id: mePlayer.id, name: mePlayer.name, avatar: mePlayer.avatar } : null;
  const waiting = meId ? pendingFor(db, meId).length : 0;
  return (
    <>
      <Nav admin={admin} clubName={club.name} me={me} waiting={waiting} />
      {admin && <AdminBanner />}
      <main className="mx-auto w-full max-w-6xl px-4 py-8 flex-1 fade-up">{children}</main>
      <footer className="text-center text-xs text-muted py-6 pb-[calc(3.5rem+env(safe-area-inset-bottom)+1.5rem)] md:pb-6 no-print">
        {club.name}
      </footer>
    </>
  );
}
