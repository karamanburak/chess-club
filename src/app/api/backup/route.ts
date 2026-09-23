import { BACKUP_NAME_RE, readBackup, readDb } from "@/lib/db";
import { localDay } from "@/lib/time";
import { isAdmin } from "@/lib/auth";
import { exportable } from "@/lib/export";

export const dynamic = "force-dynamic";

/** Downloads the whole club as one JSON file, or one snapshot with `?snapshot=db-….json`. Admin only; the installation's secrets are left out (export.ts). */
export async function GET(req: Request) {
  if (!(await isAdmin())) return new Response("Admin sign-in required", { status: 401 });
  const snapshot = new URL(req.url).searchParams.get("snapshot");
  let body: string;
  let name: string;
  if (snapshot) {
    if (!BACKUP_NAME_RE.test(snapshot)) return new Response("Invalid snapshot name", { status: 400 });
    const db = await readBackup(snapshot);
    if (!db) return new Response("Snapshot not found", { status: 404 });
    body = JSON.stringify(exportable(db), null, 2);
    name = snapshot;
  } else {
    body = JSON.stringify(exportable(await readDb()), null, 2);
    name = `chess-club-${localDay()}.json`;
  }
  return new Response(body, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
