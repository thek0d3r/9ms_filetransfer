import { describe, expect, it } from "vitest";
import { hasPremiumAccess, monthStart, planLimits } from "@/lib/plans";

describe("account plans", () => {
  const future = new Date("2030-02-01T00:00:00Z");
  const now = new Date("2030-01-15T12:00:00Z");

  it("requires an active, unexpired premium entitlement", () => {
    expect(hasPremiumAccess({ plan: "premium", subscriptionStatus: "active", subscriptionPeriodEnd: future }, now)).toBe(true);
    expect(hasPremiumAccess({ plan: "premium", subscriptionStatus: "past_due", subscriptionPeriodEnd: future }, now)).toBe(false);
    expect(hasPremiumAccess({ plan: "premium", subscriptionStatus: "active", subscriptionPeriodEnd: new Date("2030-01-01T00:00:00Z") }, now)).toBe(false);
  });

  it("raises the per-transfer limit only for premium users", () => {
    expect(planLimits(null).plan).toBe("free");
    expect(planLimits({ plan: "premium", subscriptionStatus: "active", subscriptionPeriodEnd: future }).maxTransferBytes)
      .toBeGreaterThan(planLimits(null).maxTransferBytes);
  });

  it("uses UTC calendar months for allowance resets", () => {
    expect(monthStart(new Date("2030-05-31T23:30:00-04:00")).toISOString()).toBe("2030-06-01T00:00:00.000Z");
  });
});
