import { describe, expect, it } from "vitest";
import { parseClamavResponse } from "@/lib/clamav";

describe("ClamAV responses", () => {
  it("accepts an explicit clean result", () => {
    expect(parseClamavResponse("stream: OK\0")).toEqual({ clean: true, response: "stream: OK" });
  });

  it.each([
    "stream: Eicar-Signature FOUND\0",
    "stream: Heuristics.Limits.Exceeded.MaxFileSize FOUND\0",
    "stream: Heuristics.Encrypted.Zip FOUND\0",
  ])("quarantines detections and heuristic safety alerts", (response) => {
    expect(parseClamavResponse(response).clean).toBe(false);
  });

  it("fails closed on scanner errors", () => {
    expect(() => parseClamavResponse("stream: Size limit reached ERROR\0")).toThrow("Unexpected ClamAV response");
    expect(() => parseClamavResponse("\0")).toThrow("empty response");
  });
});
