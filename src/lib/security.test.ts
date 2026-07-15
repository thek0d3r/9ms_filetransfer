import { describe, expect, it } from "vitest";
import { accessCookieValue, createToken, hashToken, verifyAccessCookie } from "@/lib/security";

describe("security tokens", () => {
  it("creates URL-safe, non-repeating tokens", () => {
    const first = createToken();
    const second = createToken();
    expect(first).not.toBe(second);
    expect(first).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("hashes deterministically without returning the token", () => {
    expect(hashToken("secret")).toBe(hashToken("secret"));
    expect(hashToken("secret")).not.toContain("secret");
  });

  it("accepts only the intended transfer cookie", () => {
    const value = accessCookieValue("transfer-a");
    expect(verifyAccessCookie(value, "transfer-a")).toBe(true);
    expect(verifyAccessCookie(value, "transfer-b")).toBe(false);
    expect(verifyAccessCookie(`${value}x`, "transfer-a")).toBe(false);
  });
});
