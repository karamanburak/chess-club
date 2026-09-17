import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Signed, stateless session cookies. Two roles share one secret:
 * "admin" (password) and "member" (the club-wide member code). Both tokens are
 * bound to the hash they were issued for, so a new member code signs every member
 * out and a new admin password signs every admin device out. Rotating the secret
 * itself signs everyone out, the "this is me" devices included.
 * Pure Node crypto: usable from proxy.ts and actions.
 */
export const ADMIN_COOKIE = "cc_admin";
export const MEMBER_COOKIE = "cc_member";
/** "This is me": binds a device to one player so they can edit their own avatar. */
export const ME_COOKIE = "cc_me";
/** Set when a visitor chose "Just browsing" on the welcome screen; the screen stays away for a month. */
export const SKIP_COOKIE = "cc_skip";
export const SKIP_DAYS = 30;
export const ADMIN_DAYS = 30;
export const MEMBER_DAYS = 90;
export const ME_DAYS = 365;

export interface TokenPayload {
  role: "admin" | "member" | "self";
  exp: number;
  nonce: string;
  /** Members: fingerprint of the code hash the token was issued for. Admins: fingerprint of the password hash. */
  bind?: string;
  /** For "self": the claimed player. */
  playerId?: string;
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

/** Short fingerprint of a stored hash; goes into the token so a new code invalidates old tokens. */
export function bindFor(hash: string): string {
  return createHmac("sha256", "bind").update(hash).digest("base64url").slice(0, 10);
}

export function createToken(payload: Omit<TokenPayload, "nonce">, secret: string): string {
  const body = Buffer.from(JSON.stringify({ ...payload, nonce: randomBytes(8).toString("hex") })).toString("base64url");
  return `${body}.${sign(body, secret)}`;
}

export function verifyToken(token: string | undefined, secret: string | undefined): TokenPayload | null {
  if (!token || !secret) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(body, secret));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString()) as TokenPayload;
    if (typeof data.exp !== "number" || data.exp <= Date.now()) return null;
    if (data.role !== "admin" && data.role !== "member" && data.role !== "self") return null;
    return data;
  } catch {
    return null;
  }
}

/** A valid admin token for the current password. No password configured means no admin. */
export function isAdminToken(token: string | undefined, secret: string | undefined, adminPasswordHash: string | undefined): boolean {
  if (!adminPasswordHash) return false;
  const t = verifyToken(token, secret);
  return !!t && t.role === "admin" && t.bind === bindFor(adminPasswordHash);
}

/** True when the cookies grant access to the club: a valid member token for the current code, or an admin. */
export function hasClubAccess(cookies: { admin?: string; member?: string }, secret: string | undefined, memberCodeHash: string | undefined, adminPasswordHash?: string): boolean {
  if (!memberCodeHash) return true;
  if (isAdminToken(cookies.admin, secret, adminPasswordHash)) return true;
  const member = verifyToken(cookies.member, secret);
  return !!member && member.role === "member" && member.bind === bindFor(memberCodeHash);
}
