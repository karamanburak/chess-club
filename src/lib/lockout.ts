/**
 * Shared brute-force brake for the three secrets people can guess: a player's PIN, the admin
 * password and the member code. Five wrong tries in a row lock the secret for ten minutes.
 * The counters live next to the secret (on the player, or in settings), so they are club-wide,
 * not per device: an attacker who hammers the form locks everyone out for ten minutes, which is
 * the point, and the lock clears by itself.
 */
export const LOCK_MAX_FAILS = 5;
export const LOCK_MINUTES = 10;

export interface Lockout {
  fails?: number;
  lockedUntil?: string | null;
}

export function isLocked(l: Lockout | undefined, now = Date.now()): boolean {
  return !!l?.lockedUntil && new Date(l.lockedUntil).getTime() > now;
}

/** Minutes left on the lock, rounded up; 0 when open. */
export function lockMinutesLeft(l: Lockout | undefined, now = Date.now()): number {
  if (!isLocked(l, now)) return 0;
  return Math.max(1, Math.ceil((new Date(l!.lockedUntil!).getTime() - now) / 60_000));
}

/** Counts a wrong attempt on the given record; the fifth in a row locks it. Returns the record. */
export function registerFail(l: Lockout, now = Date.now()): Lockout {
  l.fails = (l.fails ?? 0) + 1;
  if (l.fails >= LOCK_MAX_FAILS) {
    l.lockedUntil = new Date(now + LOCK_MINUTES * 60_000).toISOString();
    l.fails = 0;
  }
  return l;
}

export function clearFails(l: Lockout | undefined): void {
  if (!l) return;
  delete l.fails;
  delete l.lockedUntil;
}
