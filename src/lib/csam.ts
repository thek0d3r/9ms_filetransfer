import { env } from "@/lib/env";

export type CsamVerdict = {
  clean: boolean;
  source: "denylist";
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

export function scanForCsam(input: { sha256: string }, configuredDenylist = env.CSAM_SHA256_DENYLIST): CsamVerdict {
  const denylist = parseSha256Denylist(configuredDenylist);
  if (denylist.has(input.sha256.toLowerCase())) return { clean: false, source: "denylist" };
  return { clean: true, source: "denylist" };
}
