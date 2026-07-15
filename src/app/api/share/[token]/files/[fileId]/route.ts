import { NextResponse } from "next/server";
import { downloadDeleteAfter } from "@/lib/download-lifecycle";
import { env } from "@/lib/env";
import { apiError, errorMessage } from "@/lib/http";
import { downloadsStarted } from "@/lib/metrics";
import { enqueueFileDeletion } from "@/lib/queue";
import { signedDownload } from "@/lib/s3";
import { canAccess } from "@/lib/share-auth";
import { claimFileDownload, filesForTransfer, isAvailable, transferByShareToken } from "@/lib/transfers";

export async function GET(_request: Request, context: { params: Promise<{ token: string; fileId: string }> }) {
  const { token, fileId } = await context.params;
  const transfer = await transferByShareToken(token);
  if (!transfer || !isAvailable(transfer.status, transfer.expiresAt)) return apiError("Transfer not found", 404);
  if (!(await canAccess(transfer))) return apiError("Password required", 401);
  const file = (await filesForTransfer(transfer.id)).find((candidate) => candidate.id === fileId);
  if (!file) return apiError("File not found", 404);
  if (file.status === "consumed") return apiError("This file has already been downloaded.", 410);
  if (file.status !== "clean") return apiError("File not found", 404);
  const url = await signedDownload(file.objectKey, file.originalName);
  const claimedAt = new Date();
  const deleteAfter = downloadDeleteAfter(claimedAt, env.DOWNLOAD_URL_TTL_SECONDS);
  const claimed = await claimFileDownload(transfer.id, file.id, claimedAt, deleteAfter);
  if (!claimed) return apiError("This file has already been downloaded.", 410);
  try {
    await enqueueFileDeletion(claimed.id, deleteAfter);
  } catch (error) {
    console.error(JSON.stringify({ event: "download.delete_schedule_failed", transferId: transfer.id, fileId: claimed.id, error: errorMessage(error) }));
  }
  downloadsStarted.inc();
  return NextResponse.redirect(url, 302);
}
