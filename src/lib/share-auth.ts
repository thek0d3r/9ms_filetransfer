import { cookies } from "next/headers";
import type { Transfer } from "@/lib/db/schema";
import { verifyAccessCookie } from "@/lib/security";

export function accessCookieName(transferId: string) {
  return `nine_access_${transferId.replaceAll("-", "")}`;
}

export async function canAccess(transfer: Transfer) {
  if (!transfer.passwordHash) return true;
  const store = await cookies();
  return verifyAccessCookie(store.get(accessCookieName(transfer.id))?.value, transfer.id);
}
