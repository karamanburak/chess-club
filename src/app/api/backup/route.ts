import { readDb } from "@/lib/db";
import { isAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Downloads the whole club as one JSON file. Admin only. */
export async function GET() {
  if (!(await isAdmin())) return new Response("Admin sign-in required", { status: 401 });
  const body = JSON.stringify(await readDb(), null, 2);
  const name = `chess-club-${new Date().toISOString().slice(0, 10)}.json`;
  return new Response(body, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${name}"`,
    },
  });
}
