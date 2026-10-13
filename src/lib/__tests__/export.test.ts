import { describe, expect, test } from "bun:test";
import { exportable, keepInstallation } from "../export";
import { db, player } from "./fixtures";

describe("backup export", () => {
  test("a download leaves out the installation's secrets and the player PINs", () => {
    const d = db([{ ...player("a"), pinHash: "scrypt$pin", pinFails: 2, pinDevices: { dev: {} } }]);
    Object.assign(d.settings, { sessionSecret: "s", adminPasswordHash: "a", memberCodeHash: "m", adminLock: { fails: 2 }, signupTimes: ["x"] });
    const out = exportable(d);
    for (const k of ["sessionSecret", "adminPasswordHash", "memberCodeHash", "adminLock", "signupTimes"]) expect(out.settings).not.toHaveProperty(k);
    for (const k of ["pinHash", "pinFails", "pinDevices"]) expect(out.players[0]).not.toHaveProperty(k);
    expect(d.settings.sessionSecret).toBe("s");
    expect(d.players[0].pinHash).toBe("scrypt$pin");
  });

  test("a download for a move keeps the PINs, never the lock counters", () => {
    const d = db([{ ...player("a"), pinHash: "scrypt$pin", pinLocks: 1 }]);
    const out = exportable(d, { pins: true });
    expect(out.players[0].pinHash).toBe("scrypt$pin");
    expect(out.players[0]).not.toHaveProperty("pinLocks");
  });

  test("import keeps this installation's PIN for a player the file has without one", () => {
    const current = db([{ ...player("a"), pinHash: "pin-here" }, { ...player("b"), pinHash: "b-here" }]);
    const incoming = db([player("a"), { ...player("b"), pinHash: "b-file" }, player("c")]);
    const next = keepInstallation(incoming, current);
    expect(next.players.map((p) => p.pinHash)).toEqual(["pin-here", "b-file", undefined]);
  });

  test("import keeps who may get in on this installation", () => {
    const current = db([]);
    Object.assign(current.settings, { sessionSecret: "here", adminPasswordHash: "admin-here", memberCodeHash: "code-here" });
    const incoming = db([player("x")]);
    Object.assign(incoming.settings, { sessionSecret: "there", memberCodeHash: "code-there", memberLock: { fails: 3 } });
    const next = keepInstallation(incoming, current);
    expect(next.settings.sessionSecret).toBe("here");
    expect(next.settings.adminPasswordHash).toBe("admin-here");
    expect(next.settings.memberCodeHash).toBe("code-here");
    expect(next.settings).not.toHaveProperty("memberLock");
    expect(next.players.map((p) => p.id)).toEqual(["x"]);
  });
});
