import { NextResponse, type NextRequest } from "next/server";
import { readDb } from "@/lib/db";
import { ADMIN_COOKIE, hasClubAccess, ME_COOKIE, MEMBER_COOKIE, SKIP_COOKIE } from "@/lib/tokens";

/**
 * The club's front door. When a member code is configured, every page except
 * the join screen, the admin sign-in and the API needs a valid member (or
 * admin) cookie; everyone else is sent to /join. Without a code this is a
 * pass-through, so nothing changes for a club on its own Wi-Fi.
 */
export async function proxy(req: NextRequest) {
  const db = await readDb();
  const here = req.nextUrl.pathname + req.nextUrl.search;
  const to = (pathname: string) => {
    const url = req.nextUrl.clone();
    url.pathname = pathname;
    url.search = `?next=${encodeURIComponent(here)}`;
    return NextResponse.redirect(url);
  };

  if (db.settings.memberCodeHash) {
    const ok = hasClubAccess(
      { admin: req.cookies.get(ADMIN_COOKIE)?.value, member: req.cookies.get(MEMBER_COOKIE)?.value },
      db.settings.sessionSecret,
      db.settings.memberCodeHash,
    );
    if (!ok) return to("/join");
  }

  // First visit on this device: ask who they are (skippable). Presence is enough here; validity is checked on the server.
  const known = req.cookies.has(ME_COOKIE) || req.cookies.has(SKIP_COOKIE) || req.cookies.has(ADMIN_COOKIE);
  // The TV screen is a shared display, never a person: skip the identity prompt there.
  if (!known && req.nextUrl.pathname !== "/me" && !req.nextUrl.pathname.startsWith("/tv")) return to("/me");
  return NextResponse.next();
}

export const config = {
  // Static app assets (manifest, icons) must load without any cookie, otherwise "add to home screen" breaks.
  matcher: ["/((?!_next/|favicon.ico|manifest.webmanifest|icons/|join|admin|api/).*)"],
};
