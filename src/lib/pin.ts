import { isLocked, LOCK_MAX_FAILS, LOCK_MINUTES, registerFail } from "./lockout";
import type { Player } from "./types";

/** Four digits, chosen by the player the first time they say "This is me". */
export const PIN_RE = /^\d{4}$/;
export const PIN_MAX_FAILS = LOCK_MAX_FAILS;
export const PIN_LOCK_MINUTES = LOCK_MINUTES;

/** The PIN's brute-force brake lives on the player as `pinFails` / `pinLockedUntil`; the rules are the shared ones in lockout.ts. */
export function pinLocked(p: Pick<Player, "pinLockedUntil">, now = Date.now()): boolean {
  return isLocked({ lockedUntil: p.pinLockedUntil }, now);
}

/** Counts a wrong attempt; the fifth one in a row locks the PIN for a while. */
export function registerPinFail(p: Player, now = Date.now()): void {
  const l = registerFail({ fails: p.pinFails, lockedUntil: p.pinLockedUntil }, now);
  p.pinFails = l.fails;
  if (l.lockedUntil) p.pinLockedUntil = l.lockedUntil;
}

export function clearPinFails(p: Player): void {
  delete p.pinFails;
  delete p.pinLockedUntil;
}
