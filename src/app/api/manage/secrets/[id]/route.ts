import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { oneTimeSecrets } from "@/lib/db/schema";
import { apiError } from "@/lib/http";
import { bearerToken, hashToken } from "@/lib/security";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const token = bearerToken(request);
  if (!token) return apiError("Not found", 404);
  const [revoked] = await db.update(oneTimeSecrets).set({
    revokedAt: new Date(), ciphertext: null, nonce: null, authTag: null,
  }).where(and(eq(oneTimeSecrets.id, id), eq(oneTimeSecrets.manageTokenHash, hashToken(token)))).returning({ id: oneTimeSecrets.id });
  if (!revoked) return apiError("Not found", 404);
  return new NextResponse(null, { status: 204 });
}
