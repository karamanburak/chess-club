import { describe, expect, test } from "bun:test";
import { bindFor, createToken, hasClubAccess, verifyToken } from "../tokens";

const secret = "s3cret";

describe("tokens", () => {
  test("round-trip and tamper detection", () => {
    const t = createToken({ role: "admin", exp: Date.now() + 1000 }, secret);
    expect(verifyToken(t, secret)?.role).toBe("admin");
    expect(verifyToken(t, "other")).toBeNull();
    expect(verifyToken(t.slice(0, -2) + "xx", secret)).toBeNull();
    expect(verifyToken(undefined, secret)).toBeNull();
    expect(verifyToken(t, undefined)).toBeNull();
  });

  test("expired tokens are rejected", () => {
    const t = createToken({ role: "member", exp: Date.now() - 1 }, secret);
    expect(verifyToken(t, secret)).toBeNull();
  });

  test("club access: open club, member bound to the current code, admin always", () => {
    const hash = "salt:abc";
    const member = createToken({ role: "member", exp: Date.now() + 1000, bind: bindFor(hash) }, secret);
    const admin = createToken({ role: "admin", exp: Date.now() + 1000 }, secret);
    expect(hasClubAccess({}, secret, undefined)).toBe(true);
    expect(hasClubAccess({}, secret, hash)).toBe(false);
    expect(hasClubAccess({ member }, secret, hash)).toBe(true);
    expect(hasClubAccess({ member }, secret, "salt:changed")).toBe(false);
    expect(hasClubAccess({ admin }, secret, hash)).toBe(true);
    // a member token cannot pose as admin and vice versa
    expect(hasClubAccess({ admin: member }, secret, hash)).toBe(false);
  });
});
