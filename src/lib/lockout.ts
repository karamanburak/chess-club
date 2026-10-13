/**
 * Shared brute-force brake for the secrets people can guess: a player's PIN, the admin password and the member code.
 * Five tries per lock window; the fifth wrong one locks the secret, for ten minutes the first time and twice as long after every further lock (capped at a day) until a right answer clears the history.
 *
 * The counters live next to the secret (on the player, or in settings). Unknown devices share one counter; a device
 * that once gave the right answer (`trustDevice`, keyed by the `cc_dev` cookie) gets a counter of its own
 * (`counterFor`), so a stranger's wrong tries can lock out strangers but never the admin's or a player's own phone.
 * An attempt is counted **before** the secret is checked (`reserveAttempt`, inside mutate()), so parallel requests
 * cannot all slip past one read of an open lock.
 */
export const LOCK_MAX_FAILS = 5;
export const LOCK_MINUTES = 10;
/** 10 min × 2^7 ≈ 21 h: the longest a single lock lasts. */
const MAX_DOUBLINGS = 7;

export interface Lockout {
  fails?: number;
  lockedUntil?: string | null;
  /** Locks since the last right answer; each one doubles the next. */
  locks?: number;
  /** Devices that answered right before, each with its own counter (key: hashed `cc_dev` cookie). */
  devices?: Record<string, Lockout>;
}

/** Trusted devices remembered per secret; the one that answered right longest ago drops out first. */
export const MAX_TRUSTED_DEVICES = 12;

/** The counter a try from this device runs against: its own once trusted, else the shared one of unknown devices. */
export function counterFor(l: Lockout, device?: string | null): Lockout {
  return (device && l.devices?.[device]) || l;
}

/** Locked for this device (the shared lock does not stop a trusted device). */
export function isLockedFor(l: Lockout | undefined, device?: string | null, now = Date.now()): boolean {
  return !!l && isLocked(counterFor(l, device), now);
}

/** A right answer: that device's counter starts fresh and the device is trusted from now on. */
export function trustDevice(l: Lockout, device?: string | null): void {
  clearFails(counterFor(l, device));
  if (!device) return;
  const devices = (l.devices ??= {});
  delete devices[device];
  devices[device] = {};
  const keys = Object.keys(devices);
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX_TRUSTED_DEVICES))) delete devices[k];
}

export function isLocked(l: Lockout | undefined, now = Date.now()): boolean {
  return !!l?.lockedUntil && new Date(l.lockedUntil).getTime() > now;
}

/** Minutes left on the lock, rounded up; 0 when open. */
export function lockMinutesLeft(l: Lockout | undefined, now = Date.now()): number {
  if (!isLocked(l, now)) return 0;
  return Math.max(1, Math.ceil((new Date(l!.lockedUntil!).getTime() - now) / 60_000));
}

/** How long the next lock on this record lasts. */
export function nextLockMinutes(l: Lockout | undefined): number {
  return LOCK_MINUTES * 2 ** Math.min(l?.locks ?? 0, MAX_DOUBLINGS);
}

function lockNow(l: Lockout, now: number): number {
  const minutes = nextLockMinutes(l);
  l.lockedUntil = new Date(now + minutes * 60_000).toISOString();
  l.locks = (l.locks ?? 0) + 1;
  l.fails = 0;
  return minutes;
}

/**
 * Claims one try before the secret is checked. Returns false while locked, or when the tries of this window are used
 * up (then it locks, which also heals a request that died between counting and reporting its failure).
 */
export function reserveAttempt(l: Lockout, now = Date.now()): boolean {
  if (isLocked(l, now)) return false;
  if ((l.fails ?? 0) >= LOCK_MAX_FAILS) {
    lockNow(l, now);
    return false;
  }
  l.fails = (l.fails ?? 0) + 1;
  return true;
}

/** The reserved try was wrong. Locks once the window's tries are used up; returns the lock's minutes, or 0. */
export function failAttempt(l: Lockout, now = Date.now()): number {
  if (isLocked(l, now) || (l.fails ?? 0) < LOCK_MAX_FAILS) return 0;
  return lockNow(l, now);
}

/** Clears the counter itself; trusted devices stay trusted. */
export function clearFails(l: Lockout | undefined): void {
  if (!l) return;
  delete l.fails;
  delete l.lockedUntil;
  delete l.locks;
}
