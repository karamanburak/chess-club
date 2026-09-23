import { describe, expect, test } from "bun:test";
import { localPath } from "../safe-path";

describe("localPath", () => {
  test("keeps paths on this site", () => {
    expect(localPath("/players/abc?x=1")).toBe("/players/abc?x=1");
    expect(localPath("/")).toBe("/");
  });

  test("refuses other hosts and odd values", () => {
    for (const v of ["https://evil.example", "//evil.example", "/\\evil.example", "/\t/evil.example", "evil", "", null, undefined, 3]) {
      expect(localPath(v, "/admin")).toBe("/admin");
    }
  });
});
