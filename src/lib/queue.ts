import { Queue } from "bullmq";
import { bullConnection } from "@/lib/redis";

let transferQueue: Queue | undefined;

function queue() {
  transferQueue ??= new Queue("9ms-transfers", { connection: bullConnection });
  return transferQueue;
}

export async function enqueueScan(transferId: string) {
  await queue().add("scan", { transferId }, { jobId: `scan-${transferId}`, attempts: 3, backoff: { type: "exponential", delay: 5_000 } });
}

export async function enqueueCleanup() {
  await queue().add("cleanup", {}, { jobId: `cleanup-${Math.floor(Date.now() / 300_000)}`, removeOnComplete: 10, removeOnFail: 50 });
}
