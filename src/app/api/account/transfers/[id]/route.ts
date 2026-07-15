import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { activityValues } from "@/lib/activity";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { activityEvents, transfers } from "@/lib/db/schema";
import { apiError, errorMessage } from "@/lib/http";
import { deleteObjects } from "@/lib/s3";
import { filesForTransfer } from "@/lib/transfers";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const account = await currentUser();
    if (!account) return apiError("Not found", 404);
    const { id } = await context.params;
    const [owned] = await db.select({ id: transfers.id }).from(transfers).where(and(eq(transfers.id, id), eq(transfers.ownerId, account.user.id))).limit(1);
    if (!owned) return apiError("Not found", 404);
    const files = await filesForTransfer(id);
    await deleteObjects(files.map((file) => file.objectKey));
    await db.transaction(async (tx) => {
      await tx.update(transfers).set({ status: "deleted", deletedAt: new Date() }).where(and(eq(transfers.id, id), eq(transfers.ownerId, account.user.id)));
      await tx.insert(activityEvents).values(activityValues(account.user.id, "transfer.deleted", request, { transferId: id }));
    });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error(JSON.stringify({ event: "account.transfer.delete.failed", error: errorMessage(error) }));
    return apiError("Could not delete the transfer.", 500);
  }
}
