import { and, eq, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { transferFiles, transfers } from "@/lib/db/schema";
import { apiError, errorMessage } from "@/lib/http";
import { enqueueScan } from "@/lib/queue";
import { bearerToken } from "@/lib/security";
import { managedTransfer } from "@/lib/transfers";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const transfer = await managedTransfer(id, bearerToken(request));
    if (!transfer) return apiError("Not found", 404);
    if (transfer.status !== "uploading") return NextResponse.json({ status: transfer.status });
    const incomplete = await db.select({ id: transferFiles.id }).from(transferFiles)
      .where(and(eq(transferFiles.transferId, id), ne(transferFiles.status, "uploaded"))).limit(1);
    if (incomplete.length) return apiError("Every file must finish uploading first.", 409);
    await db.update(transfers).set({ status: "scanning" }).where(eq(transfers.id, id));
    await enqueueScan(id);
    return NextResponse.json({ status: "scanning" });
  } catch (error) {
    console.error(JSON.stringify({ event: "transfer.finalize.failed", transferId: id, error: errorMessage(error) }));
    return apiError("Could not finalize the transfer.", 500);
  }
}
