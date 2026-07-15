import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { transferFiles } from "@/lib/db/schema";
import { multipartSchema } from "@/lib/contracts";
import { apiError, errorMessage } from "@/lib/http";
import { abortMultipart, completeMultipart, createMultipart, listParts, objectSize, signPart } from "@/lib/s3";
import { bearerToken } from "@/lib/security";
import { managedTransfer } from "@/lib/transfers";

export const runtime = "nodejs";
const PART_SIZE = 10 * 1024 * 1024;

export async function POST(request: Request, context: { params: Promise<{ id: string; fileId: string }> }) {
  const { id, fileId } = await context.params;
  try {
    const transfer = await managedTransfer(id, bearerToken(request));
    if (!transfer) return apiError("Not found", 404);
    if (transfer.status !== "uploading") return apiError("This transfer no longer accepts uploads.", 409);
    const [file] = await db.select().from(transferFiles).where(and(eq(transferFiles.id, fileId), eq(transferFiles.transferId, transfer.id))).limit(1);
    if (!file) return apiError("File not found", 404);
    const parsed = multipartSchema.safeParse(await request.json());
    if (!parsed.success) return apiError("Invalid multipart request", 422, parsed.error.flatten());
    const input = parsed.data;

    if (input.action === "init") {
      if (file.uploadId) return NextResponse.json({ uploadId: file.uploadId, partSize: PART_SIZE });
      const uploadId = await createMultipart(file.objectKey, file.mimeType);
      await db.update(transferFiles).set({ uploadId, status: "uploading" }).where(eq(transferFiles.id, file.id));
      return NextResponse.json({ uploadId, partSize: PART_SIZE });
    }
    if (input.uploadId !== file.uploadId) return apiError("Upload session does not match.", 409);
    if (input.action === "list") return NextResponse.json({ parts: await listParts(file.objectKey, input.uploadId) });
    if (input.action === "sign") {
      const urls = await Promise.all(input.partNumbers.map(async (partNumber) => ({
        partNumber,
        url: await signPart(file.objectKey, input.uploadId, partNumber),
      })));
      return NextResponse.json({ urls });
    }
    if (input.action === "abort") {
      await abortMultipart(file.objectKey, input.uploadId);
      await db.update(transferFiles).set({ uploadId: null, status: "pending" }).where(eq(transferFiles.id, file.id));
      return new NextResponse(null, { status: 204 });
    }
    await completeMultipart(file.objectKey, input.uploadId, input.parts);
    const storedSize = await objectSize(file.objectKey);
    if (storedSize !== file.size) {
      await db.update(transferFiles).set({ status: "pending", uploadId: null }).where(eq(transferFiles.id, file.id));
      return apiError("Uploaded file size did not match the declared size.", 422);
    }
    await db.update(transferFiles).set({ status: "uploaded", uploadId: null }).where(eq(transferFiles.id, file.id));
    return NextResponse.json({ uploaded: true });
  } catch (error) {
    console.error(JSON.stringify({ event: "multipart.failed", transferId: id, fileId, error: errorMessage(error) }));
    return apiError("The upload operation failed.", 500);
  }
}
