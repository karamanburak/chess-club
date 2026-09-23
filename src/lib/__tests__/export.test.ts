import { describe, expect, test } from "bun:test";
import { exportable, keepInstallation } from "../export";
import { db, player } from "./fixtures";

describe("backup export", () => {
  test("a download leaves out the installation's secrets but keeps player PINs", () => {
    const d = db([{ ...player("a"), pinHash: "scrypt$pin" }]);
    Object.assign(d.settings, { sessionSecret: "s", adminPasswordHash: "a", ownerPasswordHash: "o", memberCodeHash: "m", adminLock: { fails: 2 } });
    const out = exportable(d);
    for (const k of ["sessionSecret", "adminPasswordHash", "ownerPasswordHash", "memberCodeHash", "adminLock"]) expect(out.settings).not.toHaveProperty(k);
    expect(out.players[0].pinHash).toBe("scrypt$pin");
    expect(d.settings.sessionSecret).toBe("s");
  });

  test("import keeps who may get in on this installation", () => {
    const current = db([]);
    Object.assign(current.settings, { sessionSecret: "here", adminPasswordHash: "admin-here", memberCodeHash: "code-here" });
    const incoming = db([player("x")]);
    Object.assign(incoming.settings, { sessionSecret: "there", memberCodeHash: "code-there", ownerPasswordHash: "owner-there" });
    const next = keepInstallation(incoming, current);
    expect(next.settings.sessionSecret).toBe("here");
    expect(next.settings.adminPasswordHash).toBe("admin-here");
    expect(next.settings.memberCodeHash).toBe("code-here");
    expect(next.settings).not.toHaveProperty("ownerPasswordHash");
    expect(next.players.map((p) => p.id)).toEqual(["x"]);
  });
});
