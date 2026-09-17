import { describe, expect, test } from "bun:test";
import { clearFails, isLocked, LOCK_MAX_FAILS, LOCK_MINUTES, lockMinutesLeft, registerFail, type Lockout } from "../lockout";
import { clearPinFails, pinLocked, registerPinFail } from "../pin";
import { player } from "./fixtures";

describe("lockout", () => {
  test("the fifth wrong try in a row locks for ten minutes, then it opens again", () => {
    const now = Date.parse("2026-09-17T18:00:00Z");
    const l: Lockout = {};
    for (let i = 1; i < LOCK_MAX_FAILS; i++) {
      registerFail(l, now);
      expect(isLocked(l, now)).toBe(false);
      expect(l.fails).toBe(i);
    }
    registerFail(l, now);
    expect(isLocked(l, now)).toBe(true);
    expect(l.fails).toBe(0);
    expect(lockMinutesLeft(l, now)).toBe(LOCK_MINUTES);
    expect(lockMinutesLeft(l, now + 9.2 * 60_000)).toBe(1);
    expect(isLocked(l, now + LOCK_MINUTES * 60_000 + 1)).toBe(false);
    expect(lockMinutesLeft(l, now + LOCK_MINUTES * 60_000 + 1)).toBe(0);
  });

  test("clearFails resets both counters and tolerates a missing record", () => {
    const l: Lockout = { fails: 3, lockedUntil: "2099-01-01T00:00:00.000Z" };
    clearFails(l);
    expect(l).toEqual({});
    expect(() => clearFails(undefined)).not.toThrow();
    expect(isLocked(undefined)).toBe(false);
  });

  test("the PIN helpers still write the player's own fields", () => {
    const p = player("a");
    for (let i = 0; i < LOCK_MAX_FAILS; i++) registerPinFail(p);
    expect(pinLocked(p)).toBe(true);
    expect(p.pinFails).toBe(0);
    clearPinFails(p);
    expect(p.pinFails).toBeUndefined();
    expect(p.pinLockedUntil).toBeUndefined();
    expect(pinLocked(p)).toBe(false);
  });
});
