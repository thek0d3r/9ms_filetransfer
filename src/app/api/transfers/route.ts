import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { transferFiles, transfers } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { createTransferSchema } from "@/lib/contracts";
import { apiError, errorMessage, requestIp } from "@/lib/http";
import { transfersCreated } from "@/lib/metrics";
import { rateLimit } from "@/lib/redis";
import { createToken, hashIdentifier, hashPassword, hashToken } from "@/lib/security";

export async function POST(request: Request) {
  try {
    const ip = requestIp(request);
    const limited = await rateLimit(`create:${hashIdentifier(ip)}`, env.CREATE_LIMIT_PER_HOUR, 60 * 60);
    if (!limited.allowed) return apiError("Too many transfers created from this network. Try again later.", 429);

    const parsed = createTransferSchema.safeParse(await request.json());
    if (!parsed.success) return apiError("Invalid transfer", 422, parsed.error.flatten());
    const input = parsed.data;
    if (input.files.length > env.MAX_FILES) return apiError(`A transfer can contain at most ${env.MAX_FILES} files.`, 422);
    const totalSize = input.files.reduce((sum, file) => sum + file.size, 0);
    if (!Number.isSafeInteger(totalSize) || totalSize > env.MAX_TRANSFER_BYTES) {
      return apiError(`Transfer exceeds the ${env.MAX_TRANSFER_BYTES} byte limit.`, 422);
    }

    const shareToken = createToken();
    const manageToken = createToken(32);
    const passwordHash = input.password ? await hashPassword(input.password) : null;
    const result = await db.transaction(async (tx) => {
      const [transfer] = await tx.insert(transfers).values({
        shareTokenHash: hashToken(shareToken),
        manageTokenHash: hashToken(manageToken),
        title: input.title || null,
        message: input.message || null,
        passwordHash,
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
      return { transfer, files };
    });

    transfersCreated.inc();
    return NextResponse.json({
      transferId: result.transfer.id,
      shareToken,
      manageToken,
      shareUrl: `${env.APP_URL}/t/${shareToken}`,
      files: result.files,
      expiresInHours: env.TRANSFER_TTL_HOURS,
    }, { status: 201 });
  } catch (error) {
    console.error(JSON.stringify({ event: "transfer.create.failed", error: errorMessage(error) }));
    return apiError("Could not create the transfer.", 500);
  }
}
