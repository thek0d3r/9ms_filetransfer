import { and, eq, gt, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { oneTimeSecrets } from "@/lib/db/schema";
import { apiError, requestIp } from "@/lib/http";
import { rateLimit } from "@/lib/redis";
import { decryptSecret } from "@/lib/secret-crypto";
import { hashIdentifier, hashToken } from "@/lib/security";

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const tokenHash = hashToken(token);
  const limit = await rateLimit(`secret:reveal:${tokenHash}:${hashIdentifier(requestIp(request))}`, 10, 15 * 60);
  if (!limit.allowed) return apiError("Too many reveal attempts.", 429);
  const [claimed] = await db.update(oneTimeSecrets).set({ consumedAt: new Date() }).where(and(
    eq(oneTimeSecrets.tokenHash, tokenHash),
    isNull(oneTimeSecrets.consumedAt),
    isNull(oneTimeSecrets.revokedAt),
    gt(oneTimeSecrets.expiresAt, new Date()),
  )).returning();
  if (!claimed?.ciphertext || !claimed.nonce || !claimed.authTag) return apiError("This secret is no longer available.", 410);
  try {
    const secret = decryptSecret({ ciphertext: claimed.ciphertext, nonce: claimed.nonce, authTag: claimed.authTag });
    await db.update(oneTimeSecrets).set({ ciphertext: null, nonce: null, authTag: null }).where(eq(oneTimeSecrets.id, claimed.id));
    return NextResponse.json({ secret }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch {
    await db.update(oneTimeSecrets).set({ ciphertext: null, nonce: null, authTag: null }).where(eq(oneTimeSecrets.id, claimed.id));
    return apiError("This secret could not be decrypted and has been destroyed.", 410);
  }
}
