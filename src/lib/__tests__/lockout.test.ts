import { describe, expect, test } from "bun:test";
import { clearFails, counterFor, failAttempt, isLocked, isLockedFor, LOCK_MAX_FAILS, LOCK_MINUTES, lockMinutesLeft, MAX_TRUSTED_DEVICES, nextLockMinutes, reserveAttempt, trustDevice, type Lockout } from "../lockout";
import { clearPinFails, pinLocked, pinSucceeded, registerPinFail, reservePinAttempt } from "../pin";
import { player } from "./fixtures";

const now = Date.parse("2026-09-17T18:00:00Z");

/** One wrong try the way the actions make it: claim first, then report the failure. */
function wrong(l: Lockout, at = now): number {
  expect(reserveAttempt(l, at)).toBe(true);
  return failAttempt(l, at);
}

describe("lockout", () => {
  test("the fifth wrong try in a row locks for ten minutes, then it opens again", () => {
    const l: Lockout = {};
    for (let i = 1; i < LOCK_MAX_FAILS; i++) {
      expect(wrong(l)).toBe(0);
      expect(isLocked(l, now)).toBe(false);
      expect(l.fails).toBe(i);
    }
    expect(wrong(l)).toBe(LOCK_MINUTES);
    expect(isLocked(l, now)).toBe(true);
    expect(l.fails).toBe(0);
    expect(reserveAttempt(l, now)).toBe(false);
    expect(lockMinutesLeft(l, now)).toBe(LOCK_MINUTES);
    expect(lockMinutesLeft(l, now + 9.2 * 60_000)).toBe(1);
    expect(isLocked(l, now + LOCK_MINUTES * 60_000 + 1)).toBe(false);
    expect(lockMinutesLeft(l, now + LOCK_MINUTES * 60_000 + 1)).toBe(0);
  });

  test("parallel tries cannot pass one open read: only five are let through per window", () => {
    const l: Lockout = {};
    // Ten requests claim before any of them has checked the secret.
    const passed = Array.from({ length: 10 }, () => reserveAttempt(l, now)).filter(Boolean).length;
    expect(passed).toBe(LOCK_MAX_FAILS);
    expect(isLocked(l, now)).toBe(true);
  });

  test("every further lock doubles, up to about a day", () => {
    const l: Lockout = {};
    let at = now;
    const lengths: number[] = [];
    for (let lock = 0; lock < 10; lock++) {
      let minutes = 0;
      for (let i = 0; i < LOCK_MAX_FAILS; i++) minutes = wrong(l, at);
      lengths.push(minutes);
      at += minutes * 60_000 + 1;
    }
    expect(lengths.slice(0, 4)).toEqual([10, 20, 40, 80]);
    expect(Math.max(...lengths)).toBe(1280);
    expect(nextLockMinutes(l)).toBe(1280);
  });

  test("a right answer clears the history, so the next lock is short again", () => {
    const l: Lockout = { fails: 3, lockedUntil: "2000-01-01T00:00:00.000Z", locks: 4 };
    clearFails(l);
    expect(l).toEqual({});
    expect(nextLockMinutes(l)).toBe(LOCK_MINUTES);
    expect(() => clearFails(undefined)).not.toThrow();
    expect(isLocked(undefined)).toBe(false);
  });

  test("the PIN helpers still write the player's own fields", () => {
    const p = player("a");
    for (let i = 0; i < LOCK_MAX_FAILS; i++) {
      expect(reservePinAttempt(p, now)).toBe(true);
      registerPinFail(p, now);
    }
    expect(pinLocked(p, now)).toBe(true);
    expect(reservePinAttempt(p, now)).toBe(false);
    expect(p.pinFails).toBe(0);
    expect(p.pinLocks).toBe(1);
    clearPinFails(p);
    expect(p.pinFails).toBeUndefined();
    expect(p.pinLockedUntil).toBeUndefined();
    expect(p.pinLocks).toBeUndefined();
    expect(pinLocked(p)).toBe(false);
  });
});

describe("trusted devices", () => {
  test("strangers locking the shared counter do not lock out a device that answered right before", () => {
    const l: Lockout = {};
    trustDevice(l, "mine");
    for (let i = 0; i < LOCK_MAX_FAILS; i++) wrong(counterFor(l, "stranger"));
    expect(isLockedFor(l, "stranger", now)).toBe(true);
    expect(isLockedFor(l, null, now)).toBe(true);
    expect(isLockedFor(l, "mine", now)).toBe(false);
    expect(reserveAttempt(counterFor(l, "mine"), now)).toBe(true);
  });

  test("a trusted device has its own brake: guessing from it still locks it", () => {
    const l: Lockout = {};
    trustDevice(l, "phone");
    for (let i = 0; i < LOCK_MAX_FAILS; i++) wrong(counterFor(l, "phone"));
    expect(isLockedFor(l, "phone", now)).toBe(true);
    expect(isLocked(l, now)).toBe(false);
  });

  test("only the most recent devices stay trusted", () => {
    const l: Lockout = {};
    for (let i = 0; i <= MAX_TRUSTED_DEVICES; i++) trustDevice(l, `d${i}`);
    expect(Object.keys(l.devices!)).toHaveLength(MAX_TRUSTED_DEVICES);
    expect(l.devices).not.toHaveProperty("d0");
    trustDevice(l, "d1");
    trustDevice(l, "new");
    expect(l.devices).toHaveProperty("d1");
    expect(l.devices).not.toHaveProperty("d2");
  });

  test("a PIN: the player's own phone keeps working while strangers are locked, and a new PIN forgets every device", () => {
    const p = player("p");
    pinSucceeded(p, "own");
    for (let i = 0; i < LOCK_MAX_FAILS; i++) {
      expect(reservePinAttempt(p, now, "thief")).toBe(true);
      registerPinFail(p, now, "thief");
    }
    expect(pinLocked(p, now, "thief")).toBe(true);
    expect(pinLocked(p, now, "own")).toBe(false);
    expect(reservePinAttempt(p, now, "own")).toBe(true);
    clearPinFails(p);
    expect(p.pinDevices).toBeUndefined();
  });
});
