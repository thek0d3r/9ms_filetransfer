import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import argon2 from "argon2";
import { env } from "@/lib/env";

export function createToken(bytes = 24) {
  return randomBytes(bytes).toString("base64url");
}

export function hashToken(token: string) {
  return createHash("sha256").update(env.TOKEN_PEPPER).update(token).digest("hex");
}

export function hashIdentifier(value: string) {
  return createHash("sha256").update(env.TOKEN_PEPPER).update(value).digest("hex");
}

export async function hashPassword(password: string) {
  return argon2.hash(password, { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 });
}

export async function verifyPassword(hash: string, password: string) {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

export function accessCookieValue(transferId: string) {
  const expires = Math.floor(Date.now() / 1000) + 60 * 60;
  const payload = `${transferId}.${expires}`;
  const signature = createHmac("sha256", env.COOKIE_SECRET).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyAccessCookie(value: string | undefined, transferId: string) {
  if (!value) return false;
  const [id, expires, signature] = value.split(".");
  if (id !== transferId || !expires || !signature || Number(expires) < Date.now() / 1000) return false;
  const expected = createHmac("sha256", env.COOKIE_SECRET).update(`${id}.${expires}`).digest("base64url");
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function bearerToken(request: Request) {
  const header = request.headers.get("authorization");
  return header?.startsWith("Bearer ") ? header.slice(7) : null;
}
