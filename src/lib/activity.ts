import { db } from "@/lib/db";
import { activityEvents } from "@/lib/db/schema";
import { requestIp } from "@/lib/http";
import { hashIdentifier } from "@/lib/security";

export function activityValues(userId: string | null, action: string, request?: Request, metadata?: Record<string, unknown>) {
  return {
    userId,
    action,
    ipHash: request ? hashIdentifier(requestIp(request)) : null,
    metadata: metadata ? JSON.stringify(metadata) : null,
  };
}

export async function recordActivity(userId: string | null, action: string, request?: Request, metadata?: Record<string, unknown>) {
  await db.insert(activityEvents).values(activityValues(userId, action, request, metadata));
}
