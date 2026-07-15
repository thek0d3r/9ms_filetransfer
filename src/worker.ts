import net from "node:net";
import { once } from "node:events";
import { Readable } from "node:stream";
import { and, eq, inArray, isNotNull, isNull, lt, lte, or } from "drizzle-orm";
import { Job, Worker } from "bullmq";
import { db } from "@/lib/db";
import { oneTimeSecrets, transferFiles, transfers } from "@/lib/db/schema";
import { parseClamavResponse } from "@/lib/clamav";
import { env } from "@/lib/env";
import { errorMessage } from "@/lib/http";
import { transfersQuarantined } from "@/lib/metrics";
import { enqueueCleanup } from "@/lib/queue";
import { bullConnection, redis } from "@/lib/redis";
import { abortMultipart, deleteObjects, getObject } from "@/lib/s3";
import { filesForTransfer } from "@/lib/transfers";

type TransferJob = { transferId: string };
type DeleteFileJob = { fileId: string };

async function scanStream(stream: Readable) {
  if (env.CLAMAV_DISABLED) return { clean: true, response: "disabled" };
  const socket = net.createConnection({ host: env.CLAMAV_HOST, port: env.CLAMAV_PORT });
  await once(socket, "connect");
  socket.write("zINSTREAM\0");
  for await (const value of stream) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    const length = Buffer.allocUnsafe(4);
    length.writeUInt32BE(chunk.length);
    if (!socket.write(length)) await once(socket, "drain");
    if (!socket.write(chunk)) await once(socket, "drain");
  }
  socket.write(Buffer.alloc(4));
  const chunks: Buffer[] = [];
  socket.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
  await Promise.race([
    once(socket, "end"),
    new Promise((_, reject) => setTimeout(() => reject(new Error("ClamAV response timed out")), 60_000)),
  ]);
  return parseClamavResponse(Buffer.concat(chunks).toString("utf8"));
}

async function scanTransfer(transferId: string) {
  const [transfer] = await db.select().from(transfers).where(eq(transfers.id, transferId)).limit(1);
  if (!transfer || transfer.status !== "scanning") return;
  const files = await filesForTransfer(transferId);
  for (const file of files) {
    if (file.status === "clean") continue;
    if (file.status !== "uploaded") throw new Error(`File ${file.id} is not ready to scan`);
    const object = await getObject(file.objectKey);
    if (!object.Body) throw new Error(`Object ${file.objectKey} has no body`);
    const verdict = await scanStream(object.Body as Readable);
    if (!verdict.clean) {
      await db.transaction(async (tx) => {
        await tx.update(transferFiles).set({ status: "infected", scannedAt: new Date() }).where(eq(transferFiles.id, file.id));
        await tx.update(transfers).set({ status: "quarantined", deletedAt: new Date() }).where(eq(transfers.id, transferId));
      });
      await deleteObjects(files.map((candidate) => candidate.objectKey));
      transfersQuarantined.inc();
      console.warn(JSON.stringify({ event: "transfer.quarantined", transferId, fileId: file.id, verdict: verdict.response }));
      return;
    }
    await db.update(transferFiles).set({ status: "clean", scannedAt: new Date() }).where(eq(transferFiles.id, file.id));
  }
  const readyAt = new Date();
  const expiresAt = new Date(readyAt.getTime() + env.TRANSFER_TTL_HOURS * 60 * 60 * 1000);
  await db.update(transfers).set({ status: "ready", readyAt, expiresAt }).where(and(eq(transfers.id, transferId), eq(transfers.status, "scanning")));
  console.info(JSON.stringify({ event: "transfer.ready", transferId, expiresAt }));
}

async function removeTransferObjects(transferId: string) {
  const files = await filesForTransfer(transferId);
  for (const file of files) {
    if (file.uploadId) {
      try { await abortMultipart(file.objectKey, file.uploadId); } catch { /* already completed or expired */ }
    }
  }
  await deleteObjects(files.map((file) => file.objectKey));
}

async function deleteConsumedFile(fileId: string) {
  const now = new Date();
  const [file] = await db.select().from(transferFiles).where(and(
    eq(transferFiles.id, fileId),
    eq(transferFiles.status, "consumed"),
    isNull(transferFiles.deletedAt),
    lte(transferFiles.deleteAfter, now),
  )).limit(1);
  if (!file) return;
  await deleteObjects([file.objectKey]);
  await db.update(transferFiles).set({ deletedAt: now }).where(and(
    eq(transferFiles.id, file.id),
    eq(transferFiles.status, "consumed"),
    isNull(transferFiles.deletedAt),
  ));
  console.info(JSON.stringify({ event: "download.object_deleted", transferId: file.transferId, fileId: file.id }));
}

async function cleanup() {
  const now = new Date();
  const staleUpload = new Date(now.getTime() - env.UPLOAD_TTL_HOURS * 60 * 60 * 1000);
  const candidates = await db.select({ id: transfers.id, status: transfers.status }).from(transfers).where(or(
    and(eq(transfers.status, "ready"), lt(transfers.expiresAt, now)),
    and(inArray(transfers.status, ["uploading", "scanning"]), lt(transfers.createdAt, staleUpload)),
  ));
  for (const transfer of candidates) {
    await removeTransferObjects(transfer.id);
    await db.update(transfers).set({ status: transfer.status === "ready" ? "expired" : "deleted", deletedAt: now }).where(eq(transfers.id, transfer.id));
  }
  const consumedFiles = await db.select({ id: transferFiles.id }).from(transferFiles).where(and(
    eq(transferFiles.status, "consumed"),
    isNull(transferFiles.deletedAt),
    lte(transferFiles.deleteAfter, now),
  ));
  for (const file of consumedFiles) await deleteConsumedFile(file.id);
  const expiredSecrets = await db.update(oneTimeSecrets).set({ ciphertext: null, nonce: null, authTag: null })
    .where(and(lt(oneTimeSecrets.expiresAt, now), isNotNull(oneTimeSecrets.ciphertext)))
    .returning({ id: oneTimeSecrets.id });
  console.info(JSON.stringify({ event: "cleanup.complete", transfers: candidates.length, consumedFiles: consumedFiles.length, secrets: expiredSecrets.length }));
}

const worker = new Worker(
  "9ms-transfers",
  async (job: Job) => {
    if (job.name === "scan") return scanTransfer((job.data as TransferJob).transferId);
    if (job.name === "delete-file") return deleteConsumedFile((job.data as DeleteFileJob).fileId);
    if (job.name === "cleanup") return cleanup();
    throw new Error(`Unknown job: ${job.name}`);
  },
  { connection: bullConnection, concurrency: 2, lockDuration: 10 * 60 * 1000 },
);

worker.on("completed", (job) => console.info(JSON.stringify({ event: "job.completed", job: job.name, id: job.id })));
worker.on("failed", async (job, error) => {
  console.error(JSON.stringify({ event: "job.failed", job: job?.name, id: job?.id, error: errorMessage(error), attempts: job?.attemptsMade }));
  if (job?.name === "scan" && job.attemptsMade >= (job.opts.attempts ?? 1)) {
    const transferId = (job.data as TransferJob).transferId;
    await removeTransferObjects(transferId).catch(() => undefined);
    await db.update(transfers).set({ status: "quarantined", deletedAt: new Date() }).where(eq(transfers.id, transferId));
    transfersQuarantined.inc();
  }
});

void enqueueCleanup();
const cleanupTimer = setInterval(() => void enqueueCleanup(), 5 * 60 * 1000);

async function shutdown() {
  clearInterval(cleanupTimer);
  await worker.close();
  await redis.quit();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());

console.info(JSON.stringify({ event: "worker.started", clamavDisabled: env.CLAMAV_DISABLED }));
