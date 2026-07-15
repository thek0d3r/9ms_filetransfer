import { PassThrough, Readable } from "node:stream";
import archiver from "archiver";
import { recordActivity } from "@/lib/activity";
import { downloadDeleteAfter } from "@/lib/download-lifecycle";
import { env } from "@/lib/env";
import { apiError, errorMessage } from "@/lib/http";
import { contentDisposition, safeFilename, uniqueArchiveNames } from "@/lib/names";
import { downloadsStarted } from "@/lib/metrics";
import { enqueueFileDeletion } from "@/lib/queue";
import { getObject } from "@/lib/s3";
import { canAccess } from "@/lib/share-auth";
import { claimTransferDownload, expediteFileDeletion, isAvailable, transferByShareToken } from "@/lib/transfers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const transfer = await transferByShareToken(token);
  if (!transfer || !isAvailable(transfer.status, transfer.expiresAt)) return apiError("Transfer not found", 404);
  if (!(await canAccess(transfer))) return apiError("Password required", 401);
  const claimedAt = new Date();
  const fallbackDeleteAfter = downloadDeleteAfter(claimedAt, env.DOWNLOAD_URL_TTL_SECONDS);
  const files = await claimTransferDownload(transfer.id, claimedAt, fallbackDeleteAfter);
  if (!files.length) return apiError("No downloadable files", 404);

  const output = new PassThrough();
  const archive = archiver("zip", { zlib: { level: 1 } });
  archive.on("error", (error) => output.destroy(error));
  archive.pipe(output);
  void (async () => {
    try {
      const names = uniqueArchiveNames(files.map((file) => file.originalName));
      for (const [index, file] of files.entries()) {
        const object = await getObject(file.objectKey);
        if (!object.Body) throw new Error(`Missing object body for ${file.id}`);
        archive.append(object.Body as Readable, { name: names[index] });
      }
      await archive.finalize();
      const deleteAfter = await expediteFileDeletion(files.map((file) => file.id));
      const scheduled = await Promise.allSettled(files.map((file) => enqueueFileDeletion(file.id, deleteAfter)));
      for (const [index, result] of scheduled.entries()) {
        if (result.status === "rejected") {
          console.error(JSON.stringify({ event: "download.delete_schedule_failed", transferId: transfer.id, fileId: files[index].id, error: errorMessage(result.reason) }));
        }
      }
    } catch (error) {
      console.error(JSON.stringify({ event: "download.zip.failed", transferId: transfer.id, error: errorMessage(error) }));
      archive.abort();
      output.destroy(error instanceof Error ? error : new Error("Archive failed"));
    }
  })();
  downloadsStarted.inc();
  if (transfer.ownerId) void recordActivity(transfer.ownerId, "transfer.zip_downloaded", request, { transferId: transfer.id, fileCount: files.length }).catch(() => undefined);
  const archiveName = safeFilename(transfer.title || "9ms-transfer") + ".zip";
  return new Response(Readable.toWeb(output) as ReadableStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": contentDisposition(archiveName),
      "Cache-Control": "private, no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
