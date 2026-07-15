import { describe, expect, it } from "vitest";
import { DOWNLOAD_DELETE_GRACE_SECONDS, downloadDeleteAfter, isDeletionDue } from "@/lib/download-lifecycle";

describe("one-time download lifecycle", () => {
  it("keeps a claimed object through the signed URL window and grace period", () => {
    const now = new Date("2026-07-15T12:00:00.000Z");
    const deleteAfter = downloadDeleteAfter(now, 900);
    expect(deleteAfter.getTime() - now.getTime()).toBe((900 + DOWNLOAD_DELETE_GRACE_SECONDS) * 1000);
  });

  it("only considers claimed objects due at or after their deletion time", () => {
    const deleteAfter = new Date("2026-07-15T12:16:00.000Z");
    expect(isDeletionDue(deleteAfter, new Date("2026-07-15T12:15:59.999Z"))).toBe(false);
    expect(isDeletionDue(deleteAfter, new Date("2026-07-15T12:16:00.000Z"))).toBe(true);
    expect(isDeletionDue(null)).toBe(false);
  });
});
