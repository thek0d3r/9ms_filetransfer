import { describe, expect, it } from "vitest";
import { contentDisposition, safeFilename, uniqueArchiveNames } from "@/lib/names";

describe("safeFilename", () => {
  it("removes traversal and control characters", () => {
    expect(safeFilename("../../pay\0load/secret.txt")).toBe("_.._pay_load_secret.txt");
  });

  it("provides a fallback for unusable names", () => {
    expect(safeFilename("... ")).toBe("file");
  });
});

describe("uniqueArchiveNames", () => {
  it("disambiguates names case-insensitively while preserving extensions", () => {
    expect(uniqueArchiveNames(["photo.jpg", "PHOTO.jpg", "photo.jpg"])).toEqual([
      "photo.jpg",
      "PHOTO (2).jpg",
      "photo (3).jpg",
    ]);
  });
});

describe("contentDisposition", () => {
  it("emits ASCII and UTF-8 filenames", () => {
    expect(contentDisposition("café.zip")).toContain("filename*=UTF-8''caf%C3%A9.zip");
  });
});
