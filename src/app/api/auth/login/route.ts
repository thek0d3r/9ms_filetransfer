import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { createSession, setSessionCookie } from "@/lib/auth";
import { loginSchema } from "@/lib/contracts";
import { db } from "@/lib/db";
import { activityEvents, users } from "@/lib/db/schema";
import { apiError, errorMessage, requestIp } from "@/lib/http";
import { rateLimit } from "@/lib/redis";
import { hashIdentifier, verifyPassword } from "@/lib/security";

export async function POST(request: Request) {
  try {
    const ipHash = hashIdentifier(requestIp(request));
    const limited = await rateLimit(`login:${ipHash}`, 10, 15 * 60);
    if (!limited.allowed) return apiError("Too many login attempts. Try again later.", 429);
    const parsed = loginSchema.safeParse(await request.json());
    if (!parsed.success) return apiError("Invalid email or password.", 401);
    const [user] = await db.select().from(users).where(eq(users.email, parsed.data.email)).limit(1);
    if (!user || !(await verifyPassword(user.passwordHash, parsed.data.password))) return apiError("Invalid email or password.", 401);
    const now = new Date();
    await db.transaction(async (tx) => {
      await tx.update(users).set({ lastLoginAt: now }).where(eq(users.id, user.id));
      await tx.insert(activityEvents).values({ userId: user.id, action: "account.login", ipHash });
    });
    const session = await createSession(user.id);
    await setSessionCookie(session.token, session.expiresAt);
    return NextResponse.json({ user: { id: user.id, email: user.email, plan: user.plan } });
  } catch (error) {
    console.error(JSON.stringify({ event: "account.login.failed", error: errorMessage(error) }));
    return apiError("Could not sign in.", 500);
  }
}
