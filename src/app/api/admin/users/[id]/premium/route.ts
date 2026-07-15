import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { activityValues } from "@/lib/activity";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { activityEvents, auditLogs, users } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { apiError, errorMessage } from "@/lib/http";

function validOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(env.APP_URL).origin;
}

async function adminFor(request: Request) {
  if (!validOrigin(request)) return null;
  const session = await currentUser();
  return session?.user.role === "admin" ? session : null;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const admin = await adminFor(request);
    if (!admin) return apiError("Not found", 404);
    const { id } = await context.params;
    const [target] = await db.select({ id: users.id, email: users.email, plan: users.plan }).from(users).where(eq(users.id, id)).limit(1);
    if (!target) return apiError("Account not found.", 404);
    if (target.plan === "premium") return apiError("This account already has Premium.", 409);

    await db.transaction(async (tx) => {
      await tx.update(users).set({ plan: "premium", subscriptionStatus: "admin_granted", subscriptionPeriodEnd: null }).where(eq(users.id, id));
      await tx.insert(activityEvents).values(activityValues(admin.user.id, "admin.premium_granted", request, { targetUserId: id, targetEmail: target.email }));
      await tx.insert(auditLogs).values({ action: "admin.premium_granted", metadata: JSON.stringify({ actorUserId: admin.user.id, targetUserId: id }) });
    });
    return NextResponse.json({ plan: "premium", status: "admin_granted" });
  } catch (error) {
    console.error(JSON.stringify({ event: "admin.premium_grant.failed", error: errorMessage(error) }));
    return apiError("Could not grant Premium.", 500);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const admin = await adminFor(request);
    if (!admin) return apiError("Not found", 404);
    const { id } = await context.params;
    const [target] = await db.select({ id: users.id, email: users.email, status: users.subscriptionStatus }).from(users).where(eq(users.id, id)).limit(1);
    if (!target) return apiError("Account not found.", 404);
    if (target.status !== "admin_granted") return apiError("Only manually granted Premium access can be revoked here.", 409);

    await db.transaction(async (tx) => {
      await tx.update(users).set({ plan: "free", subscriptionStatus: null, subscriptionPeriodEnd: null }).where(eq(users.id, id));
      await tx.insert(activityEvents).values(activityValues(admin.user.id, "admin.premium_revoked", request, { targetUserId: id, targetEmail: target.email }));
      await tx.insert(auditLogs).values({ action: "admin.premium_revoked", metadata: JSON.stringify({ actorUserId: admin.user.id, targetUserId: id }) });
    });
    return NextResponse.json({ plan: "free", status: null });
  } catch (error) {
    console.error(JSON.stringify({ event: "admin.premium_revoke.failed", error: errorMessage(error) }));
    return apiError("Could not revoke Premium.", 500);
  }
}
