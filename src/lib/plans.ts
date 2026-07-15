import type { User } from "@/lib/db/schema";
import { env } from "@/lib/env";

export type PlanLimits = {
  plan: "free" | "premium";
  maxTransferBytes: number;
  monthlyBytes: number | null;
  maxFiles: number;
  retentionDays: readonly number[];
  scanPriority: number;
};

export function hasPremiumAccess(user: Pick<User, "plan" | "subscriptionStatus" | "subscriptionPeriodEnd"> | null | undefined, now = new Date()) {
  if (!user || user.plan !== "premium") return false;
  if (user.subscriptionStatus === "admin_granted") return true;
  if (!["active", "trialing"].includes(user.subscriptionStatus ?? "")) return false;
  return !user.subscriptionPeriodEnd || user.subscriptionPeriodEnd.getTime() > now.getTime();
}

export function planLimits(user: Pick<User, "plan" | "subscriptionStatus" | "subscriptionPeriodEnd"> | null | undefined): PlanLimits {
  return hasPremiumAccess(user)
    ? { plan: "premium", maxTransferBytes: env.PREMIUM_MAX_TRANSFER_BYTES, monthlyBytes: env.PREMIUM_MONTHLY_BYTES, maxFiles: env.PREMIUM_MAX_FILES, retentionDays: [7, 14, 30], scanPriority: 1 }
    : { plan: "free", maxTransferBytes: env.MAX_TRANSFER_BYTES, monthlyBytes: null, maxFiles: env.MAX_FILES, retentionDays: [7], scanPriority: 10 };
}

export function monthStart(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export function formatBytes(value: number) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = value > 0 ? Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1) : 0;
  return `${(value / 1024 ** index).toFixed(index >= 3 ? 1 : 0)} ${units[index]}`;
}

export function formatEuro(cents: number) {
  return new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" }).format(cents / 100);
}
