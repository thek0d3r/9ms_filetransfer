import { describe, expect, it } from "vitest";
import { createTransferSchema, multipartSchema, reportSchema } from "@/lib/contracts";

describe("transfer contracts", () => {
  it("accepts the minimum valid transfer", () => {
    expect(createTransferSchema.safeParse({ files: [{ name: "notes.txt", size: 1, type: "text/plain" }] }).success).toBe(true);
  });

  it("rejects empty files", () => {
    expect(createTransferSchema.safeParse({ files: [{ name: "empty", size: 0, type: "text/plain" }] }).success).toBe(false);
  });

  it("returns a useful error for a short password", () => {
    const result = createTransferSchema.safeParse({ password: "short", files: [{ name: "notes.txt", size: 1, type: "text/plain" }] });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.password).toEqual(["Password must be at least 8 characters."]);
    }
  });

  it("validates multipart completion parts", () => {
    expect(multipartSchema.safeParse({ action: "complete", uploadId: "upload", parts: [{ partNumber: 1, etag: "etag" }] }).success).toBe(true);
    expect(multipartSchema.safeParse({ action: "complete", uploadId: "upload", parts: [] }).success).toBe(false);
  });

  it("restricts abuse reasons", () => {
    expect(reportSchema.safeParse({ reason: "malware" }).success).toBe(true);
    expect(reportSchema.safeParse({ reason: "dislike" }).success).toBe(false);
  });
});
