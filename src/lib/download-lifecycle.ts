export const DOWNLOAD_DELETE_GRACE_SECONDS = 60;

export function downloadDeleteAfter(now: Date, signedUrlTtlSeconds: number) {
  return new Date(now.getTime() + (signedUrlTtlSeconds + DOWNLOAD_DELETE_GRACE_SECONDS) * 1000);
}

export function isDeletionDue(deleteAfter: Date | null, now = new Date()) {
  return !!deleteAfter && deleteAfter.getTime() <= now.getTime();
}
