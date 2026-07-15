import { NextResponse } from "next/server";
import { createSecretSchema } from "@/lib/contracts";
import { db } from "@/lib/db";
import { oneTimeSecrets } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { apiError, requestIp } from "@/lib/http";
import { rateLimit } from "@/lib/redis";
import { encryptSecret } from "@/lib/secret-crypto";
import { createToken, hashIdentifier, hashToken } from "@/lib/security";

export async function POST(request: Request) {
  const limit = await rateLimit(`secret:create:${hashIdentifier(requestIp(request))}`, 20, 60 * 60);
  if (!limit.allowed) return apiError("Too many secret links created. Try again later.", 429);
  const parsed = createSecretSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return apiError("Invalid secret", 422, parsed.error.flatten());
  const token = createToken(32);
  const manageToken = createToken(32);
  const encrypted = encryptSecret(parsed.data.secret);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const [created] = await db.insert(oneTimeSecrets).values({
    tokenHash: hashToken(token),
    manageTokenHash: hashToken(manageToken),
    label: parsed.data.label || null,
    ...encrypted,
    expiresAt,
  }).returning({ id: oneTimeSecrets.id });
  return NextResponse.json({
    id: created.id,
    shareUrl: `${env.APP_URL}/s/${token}`,
    manageToken,
    expiresAt: expiresAt.toISOString(),
  }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
