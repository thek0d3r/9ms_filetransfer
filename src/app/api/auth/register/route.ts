import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { createSession, setSessionCookie } from "@/lib/auth";
import { registerSchema } from "@/lib/contracts";
import { db } from "@/lib/db";
import { activityEvents, users } from "@/lib/db/schema";
import { apiError, errorMessage, requestIp } from "@/lib/http";
import { rateLimit } from "@/lib/redis";
import { hashIdentifier, hashPassword } from "@/lib/security";

export async function POST(request: Request) {
  try {
    const ipHash = hashIdentifier(requestIp(request));
    const limited = await rateLimit(`register:${ipHash}`, 5, 60 * 60);
    if (!limited.allowed) return apiError("Too many registration attempts. Try again later.", 429);
    const parsed = registerSchema.safeParse(await request.json());
    if (!parsed.success) return apiError("Check your account details.", 422, parsed.error.flatten());
    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, parsed.data.email)).limit(1);
    if (existing.length) return apiError("An account with this email already exists.", 409);
    const passwordHash = await hashPassword(parsed.data.password);
    const [user] = await db.transaction(async (tx) => {
      const created = await tx.insert(users).values({ email: parsed.data.email, passwordHash }).returning();
      await tx.insert(activityEvents).values({ userId: created[0].id, action: "account.registered", ipHash });
      return created;
    });
    const session = await createSession(user.id);
    await setSessionCookie(session.token, session.expiresAt);
    return NextResponse.json({ user: { id: user.id, email: user.email, plan: user.plan } }, { status: 201 });
  } catch (error) {
    console.error(JSON.stringify({ event: "account.register.failed", error: errorMessage(error) }));
    return apiError("Could not create the account.", 500);
  }
}
