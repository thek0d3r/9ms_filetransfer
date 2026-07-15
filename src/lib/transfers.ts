import { and, eq } from "drizzle-orm";
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

export function isAvailable(status: string, expiresAt: Date | null) {
  return status === "ready" && !!expiresAt && expiresAt.getTime() > Date.now();
}
