import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { transferFiles, transfers } from "@/lib/db/schema";
import { hashToken } from "@/lib/security";

export async function transferByShareToken(token: string) {
  const [transfer] = await db.select().from(transfers).where(eq(transfers.shareTokenHash, hashToken(token))).limit(1);
  return transfer;
}

export async function managedTransfer(id: string, token: string | null) {
  if (!token) return undefined;
  const [transfer] = await db.select().from(transfers).where(and(eq(transfers.id, id), eq(transfers.manageTokenHash, hashToken(token)))).limit(1);
  return transfer;
}

export function filesForTransfer(transferId: string) {
  return db.select().from(transferFiles).where(eq(transferFiles.transferId, transferId)).orderBy(transferFiles.createdAt);
}

export async function claimFileDownload(transferId: string, fileId: string, claimedAt: Date, deleteAfter: Date) {
  return db.transaction(async (tx) => {
    const [availableTransfer] = await tx.select({ id: transfers.id }).from(transfers)
      .where(and(eq(transfers.id, transferId), eq(transfers.status, "ready"))).limit(1);
    if (!availableTransfer) return undefined;
    const [file] = await tx.update(transferFiles).set({ status: "consumed", downloadClaimedAt: claimedAt, deleteAfter })
      .where(and(eq(transferFiles.id, fileId), eq(transferFiles.transferId, transferId), eq(transferFiles.status, "clean")))
      .returning();
    if (!file) return undefined;
    await tx.update(transfers).set({ firstDownloadedAt: claimedAt })
      .where(and(eq(transfers.id, transferId), isNull(transfers.firstDownloadedAt)));
    const [remaining] = await tx.select({ id: transferFiles.id }).from(transferFiles)
      .where(and(eq(transferFiles.transferId, transferId), eq(transferFiles.status, "clean"))).limit(1);
    if (!remaining) {
      await tx.update(transfers).set({ status: "deleted", deletedAt: claimedAt })
        .where(and(eq(transfers.id, transferId), eq(transfers.status, "ready")));
    }
    return file;
  });
}

export async function claimTransferDownload(transferId: string, claimedAt: Date, deleteAfter: Date) {
  return db.transaction(async (tx) => {
    const [transfer] = await tx.update(transfers).set({ status: "deleted", deletedAt: claimedAt, firstDownloadedAt: claimedAt })
      .where(and(eq(transfers.id, transferId), eq(transfers.status, "ready")))
      .returning({ id: transfers.id });
    if (!transfer) return [];
    return tx.update(transferFiles).set({ status: "consumed", downloadClaimedAt: claimedAt, deleteAfter })
      .where(and(eq(transferFiles.transferId, transferId), eq(transferFiles.status, "clean")))
      .returning();
  });
}

export async function expediteFileDeletion(fileIds: string[]) {
  if (!fileIds.length) return new Date();
  const deleteAfter = new Date();
  await db.update(transferFiles).set({ deleteAfter })
    .where(and(inArray(transferFiles.id, fileIds), eq(transferFiles.status, "consumed")));
  return deleteAfter;
}

export function isAvailable(status: string, expiresAt: Date | null) {
  return status === "ready" && !!expiresAt && expiresAt.getTime() > Date.now();
}
