import { counterFor, failAttempt, isLockedFor, LOCK_MAX_FAILS, LOCK_MINUTES, reserveAttempt, trustDevice, type Lockout } from "./lockout";
import type { Player } from "./types";

/** Four digits, chosen by the player the first time they say "This is me". */
export const PIN_RE = /^\d{4}$/;
export const PIN_MAX_FAILS = LOCK_MAX_FAILS;
export const PIN_LOCK_MINUTES = LOCK_MINUTES;

/**
 * The PIN's brute-force brake lives on the player as `pinFails` / `pinLockedUntil` / `pinLocks` (unknown devices) and
 * `pinDevices` (devices that entered the right PIN before); the rules are the shared ones in lockout.ts.
 */
export function pinLocked(p: Pick<Player, "pinFails" | "pinLockedUntil" | "pinLocks" | "pinDevices">, now = Date.now(), device?: string | null): boolean {
  return isLockedFor(toLockout(p), device, now);
}

function toLockout(p: Pick<Player, "pinFails" | "pinLockedUntil" | "pinLocks" | "pinDevices">): Lockout {
  return { fails: p.pinFails, lockedUntil: p.pinLockedUntil, locks: p.pinLocks, devices: p.pinDevices };
}

function withPinLock<T>(p: Player, fn: (l: Lockout) => T): T {
  const l = toLockout(p);
  const out = fn(l);
  p.pinFails = l.fails;
  p.pinLockedUntil = l.lockedUntil;
  p.pinLocks = l.locks;
  p.pinDevices = l.devices;
  for (const k of ["pinFails", "pinLockedUntil", "pinLocks", "pinDevices"] as const) if (p[k] === undefined) delete p[k];
  return out;
}

/** Counts a try before the PIN is checked (inside mutate()); false while locked for this device. */
export function reservePinAttempt(p: Player, now = Date.now(), device?: string | null): boolean {
  return withPinLock(p, (l) => reserveAttempt(counterFor(l, device), now));
}

/** The reserved try was wrong; returns the lock's minutes once it locks, else 0. */
export function registerPinFail(p: Player, now = Date.now(), device?: string | null): number {
  return withPinLock(p, (l) => failAttempt(counterFor(l, device), now));
}

/** The right PIN from this device: its counter starts fresh and the device keeps a counter of its own from now on. */
export function pinSucceeded(p: Player, device?: string | null): void {
  withPinLock(p, (l) => trustDevice(l, device));
}

/** A new or cleared PIN: every counter and every trusted device starts over. */
export function clearPinFails(p: Player): void {
  delete p.pinFails;
  delete p.pinLockedUntil;
  delete p.pinLocks;
  delete p.pinDevices;
}
