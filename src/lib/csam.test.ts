import { describe, expect, it } from "vitest";
import { isCsamScannableMedia, parseHiveCsamResponse, parseSha256Denylist } from "@/lib/csam";

describe("CSAM safety scanning", () => {
  it("parses and validates an exact-hash denylist", () => {
    const hash = "a".repeat(64);
    expect(parseSha256Denylist(`${hash.toUpperCase()}, ${"b".repeat(64)}`).has(hash)).toBe(true);
    expect(() => parseSha256Denylist("not-a-hash")).toThrow(/invalid SHA-256/u);
  });

  it("recognizes provider-supported media by magic bytes rather than user MIME", () => {
    expect(isCsamScannableMedia(Buffer.from("ffd8ffe000104a464946", "hex"))).toBe(true);
    expect(isCsamScannableMedia(Buffer.from("89504e470d0a1a0a", "hex"))).toBe(true);
    expect(isCsamScannableMedia(Buffer.from("00000018667479706d703432", "hex"))).toBe(true);
    expect(isCsamScannableMedia(Buffer.from("255044462d312e37", "hex"))).toBe(false);
  });

  it("detects known and classifier matches", () => {
    expect(parseHiveCsamResponse({ status: [{ status: { code: 200 }, response: { output: { file: { reasons: ["matched"] }, hashes: [{}] } } }] }).clean).toBe(false);
    expect(parseHiveCsamResponse({ status: [{ status: { code: 200 }, response: { output: { file: { reasons: ["csam"] }, hashes: [] } } }] }).clean).toBe(false);
  });

  it("accepts a complete clean verdict and fails closed on malformed responses", () => {
    const clean = { status: [{ status: { code: 200 }, response: { output: { file: { reasons: [] }, hashes: [] } } }] };
    expect(parseHiveCsamResponse(clean)).toEqual({ clean: true, source: "hive" });
    expect(() => parseHiveCsamResponse({ status: [] })).toThrow(/invalid response/u);
    expect(() => parseHiveCsamResponse({ status: [{ status: { code: 500 } }] })).toThrow(/scan failed/u);
  });
});
