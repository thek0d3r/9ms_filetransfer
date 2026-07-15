import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { apiError, requestIp } from "@/lib/http";
import { rateLimit } from "@/lib/redis";
import { accessCookieValue, hashIdentifier, verifyPassword } from "@/lib/security";
import { accessCookieName } from "@/lib/share-auth";
import { isAvailable, transferByShareToken } from "@/lib/transfers";

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const transfer = await transferByShareToken(token);
  if (!transfer || !isAvailable(transfer.status, transfer.expiresAt)) return apiError("Transfer not found", 404);
  if (!transfer.passwordHash) return NextResponse.json({ unlocked: true });
  const limit = await rateLimit(`unlock:${transfer.id}:${hashIdentifier(requestIp(request))}`, env.PASSWORD_ATTEMPT_LIMIT, 15 * 60);
  if (!limit.allowed) return apiError("Too many password attempts. Try again later.", 429);
  const password = (await request.json().catch(() => ({})) as { password?: unknown }).password;
  if (typeof password !== "string" || !(await verifyPassword(transfer.passwordHash, password))) return apiError("Incorrect password", 401);
  const response = NextResponse.json({ unlocked: true });
  response.cookies.set(accessCookieName(transfer.id), accessCookieValue(transfer.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60,
    path: `/`,
  });
  return response;
}
