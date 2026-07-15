import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { reportSchema } from "@/lib/contracts";
import { db } from "@/lib/db";
import { abuseReports, transfers } from "@/lib/db/schema";
import { apiError, requestIp } from "@/lib/http";
import { rateLimit } from "@/lib/redis";
import { hashIdentifier } from "@/lib/security";
import { transferByShareToken } from "@/lib/transfers";

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const transfer = await transferByShareToken(token);
  if (!transfer) return apiError("Transfer not found", 404);
  const reporterHash = hashIdentifier(requestIp(request));
  const limit = await rateLimit(`report:${transfer.id}:${reporterHash}`, 2, 24 * 60 * 60);
  if (!limit.allowed) return apiError("This transfer has already been reported.", 429);
  const parsed = reportSchema.safeParse(await request.json());
  if (!parsed.success) return apiError("Invalid report", 422, parsed.error.flatten());
  await db.transaction(async (tx) => {
    await tx.insert(abuseReports).values({ transferId: transfer.id, reporterHash, ...parsed.data });
    await tx.update(transfers).set({ reportCount: sql`${transfers.reportCount} + 1` }).where(eq(transfers.id, transfer.id));
  });
  return NextResponse.json({ reported: true }, { status: 201 });
}
