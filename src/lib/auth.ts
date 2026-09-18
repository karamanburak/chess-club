import "server-only";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { mutate, readDb } from "./db";
import { UserError } from "./errors";
import { ADMIN_COOKIE, ADMIN_DAYS, bindFor, createToken, isAdminToken, ME_COOKIE, ME_DAYS, MEMBER_COOKIE, MEMBER_DAYS, verifyToken } from "./tokens";

export { ADMIN_COOKIE as SESSION_COOKIE };

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

async function getSecret(): Promise<string> {
  const db = await readDb();
  if (db.settings.sessionSecret) return db.settings.sessionSecret;
  return mutate((d) => {
    d.settings.sessionSecret ??= randomBytes(32).toString("hex");
    return d.settings.sessionSecret;
  });
}

export async function adminConfigured(): Promise<boolean> {
  return !!(await readDb()).settings.adminPasswordHash;
}

/** Signed in as admin: a valid token bound to the current password hash. Changing the password signs every admin device out. */
export async function isAdmin(): Promise<boolean> {
  const jar = await cookies();
  const db = await readDb();
  return isAdminToken(jar.get(ADMIN_COOKIE)?.value, await getSecret(), db.settings.adminPasswordHash);
}

/** Admin or a device that claimed a player: may organise club nights, tournaments and rounds. Guests only browse. */
export async function isMemberDevice(): Promise<boolean> {
  return (await isAdmin()) || !!(await currentPlayerId());
}

export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) throw new UserError("Admin sign-in required for this action.");
}

/** Issues the admin cookie for the current password. Call it again right after a password change, so this device stays signed in. */
export async function setSessionCookie(): Promise<void> {
  const jar = await cookies();
  const hash = (await readDb()).settings.adminPasswordHash;
  if (!hash) throw new Error("No admin password configured.");
  jar.set(ADMIN_COOKIE, createToken({ role: "admin", exp: Date.now() + ADMIN_DAYS * 86400_000, bind: bindFor(hash) }, await getSecret()), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: ADMIN_DAYS * 86400,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(ADMIN_COOKIE);
}

/**
 * Replaces the signing secret. Every cookie ever issued (admin, member, "this is me") stops
 * verifying at once; each device signs in again. Returns the new secret.
 */
export async function rotateSessionSecret(): Promise<string> {
  return mutate((d) => {
    d.settings.sessionSecret = randomBytes(32).toString("hex");
    return d.settings.sessionSecret;
  });
}

/* ------------------------------------------------------------------ */
/* Member code: one shared code for the whole club                     */
/* ------------------------------------------------------------------ */

export async function memberCodeRequired(): Promise<boolean> {
  return !!(await readDb()).settings.memberCodeHash;
}

/** True when this browser may use the club: no code configured, a valid member cookie, or an admin. */
export async function isMember(): Promise<boolean> {
  const db = await readDb();
  const hash = db.settings.memberCodeHash;
  if (!hash) return true;
  if (await isAdmin()) return true;
  const jar = await cookies();
  const token = verifyToken(jar.get(MEMBER_COOKIE)?.value, await getSecret());
  return !!token && token.role === "member" && token.bind === bindFor(hash);
}

export async function setMemberCookie(codeHash: string): Promise<void> {
  const jar = await cookies();
  jar.set(MEMBER_COOKIE, createToken({ role: "member", exp: Date.now() + MEMBER_DAYS * 86400_000, bind: bindFor(codeHash) }, await getSecret()), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: MEMBER_DAYS * 86400,
  });
}

/* ------------------------------------------------------------------ */
/* "This is me": a device claims one player                            */
/* ------------------------------------------------------------------ */

/** The player this browser claims to be, if any and if they still exist. */
export async function currentPlayerId(): Promise<string | null> {
  const jar = await cookies();
  const token = verifyToken(jar.get(ME_COOKIE)?.value, await getSecret());
  if (!token || token.role !== "self" || !token.playerId) return null;
  const db = await readDb();
  return db.players.some((p) => p.id === token.playerId) ? token.playerId : null;
}

export async function setMeCookie(playerId: string): Promise<void> {
  const jar = await cookies();
  jar.set(ME_COOKIE, createToken({ role: "self", exp: Date.now() + ME_DAYS * 86400_000, playerId }, await getSecret()), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: ME_DAYS * 86400,
  });
}

export async function clearMeCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(ME_COOKIE);
}
