import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auditLogs, transfers } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { apiError } from "@/lib/http";
import { bearerToken, hashToken } from "@/lib/security";
import { deleteObjects } from "@/lib/s3";
import { filesForTransfer } from "@/lib/transfers";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const supplied = bearerToken(request);
  if (!supplied || hashToken(supplied) !== hashToken(env.OPS_TOKEN)) return apiError("Not found", 404);
  const { id } = await context.params;
  const files = await filesForTransfer(id);
  await deleteObjects(files.map((file) => file.objectKey));
  await db.transaction(async (tx) => {
    await tx.update(transfers).set({ status: "deleted", deletedAt: new Date() }).where(eq(transfers.id, id));
    await tx.insert(auditLogs).values({ action: "operator.delete", transferId: id });
  });
  return new NextResponse(null, { status: 204 });
}
