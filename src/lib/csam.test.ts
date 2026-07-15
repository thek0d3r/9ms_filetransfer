import { describe, expect, it } from "vitest";
import { parseSha256Denylist, scanForCsam } from "@/lib/csam";

describe("CSAM safety scanning", () => {
  it("parses and validates an exact-hash denylist", () => {
    const hash = "a".repeat(64);
    expect(parseSha256Denylist(`${hash.toUpperCase()}, ${"b".repeat(64)}`).has(hash)).toBe(true);
    expect(() => parseSha256Denylist("not-a-hash")).toThrow(/invalid SHA-256/u);
  });

  it("blocks hashes on the configured denylist", () => {
    const hash = "a".repeat(64);
    expect(scanForCsam({ sha256: hash }, hash)).toEqual({ clean: false, source: "denylist" });
    expect(scanForCsam({ sha256: "b".repeat(64) }, hash)).toEqual({ clean: true, source: "denylist" });
  });
});
