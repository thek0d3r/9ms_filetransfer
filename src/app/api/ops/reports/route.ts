import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { abuseReports, transfers } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { apiError } from "@/lib/http";
import { bearerToken, hashToken } from "@/lib/security";

function authorized(request: Request) {
  const supplied = bearerToken(request);
  return !!supplied && hashToken(supplied) === hashToken(env.OPS_TOKEN);
}

export async function GET(request: Request) {
  if (!authorized(request)) return apiError("Not found", 404);
  const reports = await db.select({
    id: abuseReports.id,
    reason: abuseReports.reason,
    details: abuseReports.details,
    status: abuseReports.status,
    createdAt: abuseReports.createdAt,
    transferId: transfers.id,
    transferStatus: transfers.status,
    fileCount: transfers.fileCount,
    totalSize: transfers.totalSize,
  }).from(abuseReports).innerJoin(transfers, eq(abuseReports.transferId, transfers.id)).orderBy(desc(abuseReports.createdAt)).limit(100);
  return NextResponse.json({ reports });
}
