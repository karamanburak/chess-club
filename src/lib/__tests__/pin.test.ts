import { describe, expect, test } from "bun:test";
import { clearPinFails, PIN_MAX_FAILS, PIN_RE, pinLocked, registerPinFail, reservePinAttempt } from "../pin";
import { player } from "./fixtures";

describe("pin", () => {
  test("exactly four digits", () => {
    expect(PIN_RE.test("1234")).toBe(true);
    expect(PIN_RE.test("123")).toBe(false);
    expect(PIN_RE.test("12345")).toBe(false);
    expect(PIN_RE.test("12a4")).toBe(false);
  });

  test("five wrong tries lock the PIN, a correct one clears the counter", () => {
    const p = player("a");
    const now = Date.UTC(2026, 0, 1);
    const wrong = () => {
      expect(reservePinAttempt(p, now)).toBe(true);
      registerPinFail(p, now);
    };
    for (let i = 0; i < PIN_MAX_FAILS - 1; i++) wrong();
    expect(pinLocked(p, now)).toBe(false);
    wrong();
    expect(pinLocked(p, now)).toBe(true);
    expect(pinLocked(p, now + 11 * 60_000)).toBe(false);
    clearPinFails(p);
    expect(p.pinFails).toBeUndefined();
    expect(p.pinLockedUntil).toBeUndefined();
  });
});
