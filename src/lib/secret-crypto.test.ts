import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "@/lib/secret-crypto";

describe("one-time secret encryption", () => {
  it("round-trips Unicode without storing plaintext", () => {
    const value = "sëcret-🔐-correct horse battery staple";
    const encrypted = encryptSecret(value);
    expect(encrypted.ciphertext).not.toContain(value);
    expect(decryptSecret(encrypted)).toBe(value);
  });

  it("rejects tampered ciphertext", () => {
    const encrypted = encryptSecret("do not alter");
    const first = encrypted.ciphertext[0] === "A" ? "B" : "A";
    expect(() => decryptSecret({ ...encrypted, ciphertext: `${first}${encrypted.ciphertext.slice(1)}` })).toThrow();
  });
});
