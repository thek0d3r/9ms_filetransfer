import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { oneTimeSecrets } from "@/lib/db/schema";
import { hashToken } from "@/lib/security";

export async function secretByToken(token: string) {
  const [secret] = await db.select({
    id: oneTimeSecrets.id,
    label: oneTimeSecrets.label,
    expiresAt: oneTimeSecrets.expiresAt,
    consumedAt: oneTimeSecrets.consumedAt,
    revokedAt: oneTimeSecrets.revokedAt,
  }).from(oneTimeSecrets).where(eq(oneTimeSecrets.tokenHash, hashToken(token))).limit(1);
  return secret;
}

export function secretIsAvailable(secret: Awaited<ReturnType<typeof secretByToken>>) {
  return !!secret && !secret.consumedAt && !secret.revokedAt && secret.expiresAt.getTime() > Date.now();
}
