import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "@/lib/env";

function key() {
  return createHash("sha256").update(env.SECRET_ENCRYPTION_KEY).digest();
}

export function encryptSecret(value: string) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), nonce);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64url"),
    nonce: nonce.toString("base64url"),
    authTag: cipher.getAuthTag().toString("base64url"),
  };
}

export function decryptSecret(payload: { ciphertext: string; nonce: string; authTag: string }) {
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(payload.nonce, "base64url"));
  decipher.setAuthTag(Buffer.from(payload.authTag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
