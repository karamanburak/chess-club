import { failAttempt, isLocked, LOCK_MAX_FAILS, LOCK_MINUTES, reserveAttempt, type Lockout } from "./lockout";
import type { Player } from "./types";

/** Four digits, chosen by the player the first time they say "This is me". */
export const PIN_RE = /^\d{4}$/;
export const PIN_MAX_FAILS = LOCK_MAX_FAILS;
export const PIN_LOCK_MINUTES = LOCK_MINUTES;

/** The PIN's brute-force brake lives on the player as `pinFails` / `pinLockedUntil` / `pinLocks`; the rules are the shared ones in lockout.ts. */
export function pinLocked(p: Pick<Player, "pinLockedUntil">, now = Date.now()): boolean {
  return isLocked({ lockedUntil: p.pinLockedUntil }, now);
}

function withPinLock<T>(p: Player, fn: (l: Lockout) => T): T {
  const l: Lockout = { fails: p.pinFails, lockedUntil: p.pinLockedUntil, locks: p.pinLocks };
  const out = fn(l);
  p.pinFails = l.fails;
  p.pinLockedUntil = l.lockedUntil;
  p.pinLocks = l.locks;
  return out;
}

/** Counts a try before the PIN is checked (inside mutate()); false while locked. */
export function reservePinAttempt(p: Player, now = Date.now()): boolean {
  return withPinLock(p, (l) => reserveAttempt(l, now));
}

/** The reserved try was wrong; returns the lock's minutes once it locks, else 0. */
export function registerPinFail(p: Player, now = Date.now()): number {
  return withPinLock(p, (l) => failAttempt(l, now));
}

export function clearPinFails(p: Player): void {
  delete p.pinFails;
  delete p.pinLockedUntil;
  delete p.pinLocks;
}
