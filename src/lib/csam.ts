import { env } from "@/lib/env";
import { signedSafetyScan } from "@/lib/s3";

export type CsamVerdict = {
  clean: boolean;
  source: "denylist" | "hive" | "not-applicable" | "not-configured";
};

export function parseSha256Denylist(value: string) {
  const hashes = value
    .split(/[\s,]+/u)
    .map((hash) => hash.trim().toLowerCase())
    .filter(Boolean);
  for (const hash of hashes) {
    if (!/^[a-f0-9]{64}$/u.test(hash)) throw new Error("CSAM_SHA256_DENYLIST contains an invalid SHA-256 hash");
  }
  return new Set(hashes);
}

export function isCsamScannableMedia(header: Buffer) {
  if (header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) return true;
  if (header.length >= 8 && header.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) return true;
  if (header.length >= 6 && ["GIF87a", "GIF89a"].includes(header.subarray(0, 6).toString("ascii"))) return true;
  if (header.length >= 12 && header.subarray(0, 4).toString("ascii") === "RIFF" && header.subarray(8, 12).toString("ascii") === "WEBP") return true;
  if (header.length >= 12 && header.subarray(4, 8).toString("ascii") === "ftyp") {
    const brand = header.subarray(8, 12).toString("ascii");
    return new Set(["isom", "iso2", "mp41", "mp42", "avc1", "M4V ", "qt  "]).has(brand);
  }
  return false;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

export function parseHiveCsamResponse(value: unknown): CsamVerdict {
  const root = record(value);
  const statuses = root?.status;
  if (!Array.isArray(statuses) || statuses.length === 0) throw new Error("CSAM provider returned an invalid response");

  let matched = false;
  for (const item of statuses) {
    const entry = record(item);
    const status = record(entry?.status);
    if (status?.code !== 200) throw new Error("CSAM provider scan failed");
    const output = record(record(entry?.response)?.output);
    const file = record(output?.file);
    if (!output || !file) throw new Error("CSAM provider omitted its verdict");
    const reasons = Array.isArray(file.reasons) ? file.reasons : [];
    const hashes = Array.isArray(output.hashes) ? output.hashes : [];
    if (reasons.some((reason) => reason === "matched" || reason === "csam") || hashes.length > 0) matched = true;
  }
  return { clean: !matched, source: "hive" };
}

export async function scanForCsam(input: {
  objectKey: string;
  sha256: string;
  header: Buffer;
}): Promise<CsamVerdict> {
  const denylist = parseSha256Denylist(env.CSAM_SHA256_DENYLIST);
  if (denylist.has(input.sha256.toLowerCase())) return { clean: false, source: "denylist" };
  if (!isCsamScannableMedia(input.header)) return { clean: true, source: "not-applicable" };

  if (!env.CSAM_HIVE_API_KEY) {
    if (env.CSAM_PROVIDER_REQUIRED) throw new Error("CSAM provider is required but CSAM_HIVE_API_KEY is not configured");
    return { clean: true, source: "not-configured" };
  }

  const body = new FormData();
  body.set("url", await signedSafetyScan(input.objectKey));
  const response = await fetch(env.CSAM_HIVE_API_URL, {
    method: "POST",
    headers: { Authorization: `Token ${env.CSAM_HIVE_API_KEY}` },
    body,
    signal: AbortSignal.timeout(env.CSAM_PROVIDER_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`CSAM provider returned HTTP ${response.status}`);
  return parseHiveCsamResponse(await response.json());
}
