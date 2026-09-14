import type { Player } from "./types";

/** Four digits, chosen by the player the first time they say "This is me". */
export const PIN_RE = /^\d{4}$/;
export const PIN_MAX_FAILS = 5;
export const PIN_LOCK_MINUTES = 10;

export function pinLocked(p: Pick<Player, "pinLockedUntil">, now = Date.now()): boolean {
  return !!p.pinLockedUntil && new Date(p.pinLockedUntil).getTime() > now;
}

/** Counts a wrong attempt; the fifth one in a row locks the PIN for a while. */
export function registerPinFail(p: Player, now = Date.now()): void {
  p.pinFails = (p.pinFails ?? 0) + 1;
  if (p.pinFails >= PIN_MAX_FAILS) {
    p.pinLockedUntil = new Date(now + PIN_LOCK_MINUTES * 60_000).toISOString();
    p.pinFails = 0;
  }
}

export function clearPinFails(p: Player): void {
  delete p.pinFails;
  delete p.pinLockedUntil;
}
