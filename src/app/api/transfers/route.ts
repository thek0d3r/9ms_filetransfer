import { randomUUID } from "node:crypto";
import { and, eq, gte, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { activityValues } from "@/lib/activity";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { activityEvents, transferFiles, transfers } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { createTransferSchema } from "@/lib/contracts";
import { apiError, errorMessage, requestIp } from "@/lib/http";
import { transfersCreated } from "@/lib/metrics";
import { formatBytes, monthStart, planLimits } from "@/lib/plans";
import { rateLimit } from "@/lib/redis";
import { createToken, hashIdentifier, hashPassword, hashToken } from "@/lib/security";

class QuotaError extends Error {}

export async function POST(request: Request) {
  try {
    const ip = requestIp(request);
    const limited = await rateLimit(`create:${hashIdentifier(ip)}`, env.CREATE_LIMIT_PER_HOUR, 60 * 60);
    if (!limited.allowed) return apiError("Too many transfers created from this network. Try again later.", 429);

    const parsed = createTransferSchema.safeParse(await request.json());
    if (!parsed.success) return apiError("Invalid transfer", 422, parsed.error.flatten());
    const input = parsed.data;
    const account = await currentUser();
    const limits = planLimits(account?.user);
    if (input.files.length > limits.maxFiles) return apiError(`Your ${limits.plan} plan allows at most ${limits.maxFiles} files per transfer.`, 422);
    if (!limits.retentionDays.includes(input.retentionDays)) return apiError("That expiry is not available on your plan.", 422);
    const totalSize = input.files.reduce((sum, file) => sum + file.size, 0);
    if (!Number.isSafeInteger(totalSize) || totalSize > limits.maxTransferBytes) {
      return apiError(`Your ${limits.plan} plan allows up to ${formatBytes(limits.maxTransferBytes)} per transfer.`, 422);
    }

    const shareToken = createToken();
    const manageToken = createToken(32);
    const passwordHash = input.password ? await hashPassword(input.password) : null;
    const result = await db.transaction(async (tx) => {
      if (account && limits.monthlyBytes) {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${account.user.id}))`);
        const [usage] = await tx.select({ total: sql<string>`coalesce(sum(${transfers.totalSize}), 0)` })
          .from(transfers)
          .where(and(eq(transfers.ownerId, account.user.id), gte(transfers.createdAt, monthStart())));
        const usedBytes = Number(usage?.total ?? 0);
        if (usedBytes + totalSize > limits.monthlyBytes) {
          throw new QuotaError(`This transfer would exceed your ${formatBytes(limits.monthlyBytes)} monthly Premium allowance.`);
        }
      }
      const [transfer] = await tx.insert(transfers).values({
        ownerId: account?.user.id ?? null,
        shareTokenHash: hashToken(shareToken),
        manageTokenHash: hashToken(manageToken),
        title: input.title || null,
        message: input.message || null,
        passwordHash,
        retentionHours: input.retentionDays * 24,
        scanPriority: limits.scanPriority,
        totalSize,
        fileCount: input.files.length,
      }).returning();
      const files = await tx.insert(transferFiles).values(input.files.map((file) => ({
        transferId: transfer.id,
        objectKey: `transfers/${transfer.id}/${randomUUID()}`,
        originalName: file.name,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
      }))).returning({ id: transferFiles.id, name: transferFiles.originalName, size: transferFiles.size });
      if (account) await tx.insert(activityEvents).values(activityValues(account.user.id, "transfer.created", request, {
        transferId: transfer.id,
        totalSize,
        fileCount: input.files.length,
        plan: limits.plan,
      }));
      return { transfer, files };
    });

    transfersCreated.inc();
    return NextResponse.json({
      transferId: result.transfer.id,
      shareToken,
      manageToken,
      shareUrl: `${env.APP_URL}/t/${shareToken}`,
      files: result.files,
      expiresInHours: result.transfer.retentionHours,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof QuotaError) return apiError(error.message, 422);
    console.error(JSON.stringify({ event: "transfer.create.failed", error: errorMessage(error) }));
    return apiError("Could not create the transfer.", 500);
  }
}
