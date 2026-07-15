import { NextResponse } from "next/server";
import { apiError } from "@/lib/http";
import { downloadsStarted } from "@/lib/metrics";
import { signedDownload } from "@/lib/s3";
import { canAccess } from "@/lib/share-auth";
import { filesForTransfer, isAvailable, transferByShareToken } from "@/lib/transfers";

export async function GET(_request: Request, context: { params: Promise<{ token: string; fileId: string }> }) {
  const { token, fileId } = await context.params;
  const transfer = await transferByShareToken(token);
  if (!transfer || !isAvailable(transfer.status, transfer.expiresAt)) return apiError("Transfer not found", 404);
  if (!(await canAccess(transfer))) return apiError("Password required", 401);
  const file = (await filesForTransfer(transfer.id)).find((candidate) => candidate.id === fileId && candidate.status === "clean");
  if (!file) return apiError("File not found", 404);
  downloadsStarted.inc();
  return NextResponse.redirect(await signedDownload(file.objectKey, file.originalName), 302);
}
