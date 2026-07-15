import { cookies } from "next/headers";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/lib/db";
import { userSessions, users } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { createToken, hashToken } from "@/lib/security";

export const SESSION_COOKIE = "nine_ms_session";

export async function createSession(userId: string) {
  const token = createToken(32);
  const expiresAt = new Date(Date.now() + env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(userSessions).values({ userId, tokenHash: hashToken(token), expiresAt });
  return { token, expiresAt };
}

export async function setSessionCookie(token: string, expiresAt: Date) {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function currentUser() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const [result] = await db.select({ user: users, sessionId: userSessions.id })
    .from(userSessions)
    .innerJoin(users, eq(userSessions.userId, users.id))
    .where(and(eq(userSessions.tokenHash, hashToken(token)), gt(userSessions.expiresAt, new Date())))
    .limit(1);
  return result ?? null;
}

export async function clearCurrentSession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(userSessions).where(eq(userSessions.tokenHash, hashToken(token)));
  store.set(SESSION_COOKIE, "", { httpOnly: true, secure: env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
}
