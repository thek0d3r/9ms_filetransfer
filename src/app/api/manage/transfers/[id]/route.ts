import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { transfers } from "@/lib/db/schema";
import { apiError, errorMessage } from "@/lib/http";
import { bearerToken } from "@/lib/security";
import { deleteObjects } from "@/lib/s3";
import { filesForTransfer, managedTransfer } from "@/lib/transfers";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const transfer = await managedTransfer(id, bearerToken(request));
    if (!transfer) return apiError("Not found", 404);
    const files = await filesForTransfer(id);
    await deleteObjects(files.map((file) => file.objectKey));
    await db.update(transfers).set({ status: "deleted", deletedAt: new Date() }).where(eq(transfers.id, id));
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error(JSON.stringify({ event: "transfer.delete.failed", transferId: id, error: errorMessage(error) }));
    return apiError("Could not delete the transfer.", 500);
  }
}
