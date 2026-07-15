import { NextResponse } from "next/server";
import { apiError } from "@/lib/http";
import { bearerToken } from "@/lib/security";
import { managedTransfer } from "@/lib/transfers";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const transfer = await managedTransfer(id, bearerToken(request));
  if (!transfer) return apiError("Not found", 404);
  return NextResponse.json({ status: transfer.status, expiresAt: transfer.expiresAt?.toISOString() ?? null });
}
