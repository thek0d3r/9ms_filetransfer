import IORedis from "ioredis";
import { env } from "@/lib/env";

const globalForRedis = globalThis as unknown as { redis?: IORedis };
export const redis = globalForRedis.redis ?? new IORedis(env.VALKEY_URL, { maxRetriesPerRequest: null, lazyConnect: true });
if (env.NODE_ENV !== "production") globalForRedis.redis = redis;
redis.on("error", (error) => {
  if (env.NODE_ENV !== "test") console.error(JSON.stringify({ event: "valkey.error", error: error.message }));
});

const redisUrl = new URL(env.VALKEY_URL);
export const bullConnection = {
  host: redisUrl.hostname,
  port: Number(redisUrl.port || 6379),
  username: redisUrl.username || undefined,
  password: redisUrl.password || undefined,
  ...(redisUrl.protocol === "rediss:" ? { tls: {} } : {}),
};

export async function rateLimit(key: string, limit: number, seconds: number) {
  const namespaced = `9ms:rate:${key}`;
  const count = await redis.incr(namespaced);
  if (count === 1) await redis.expire(namespaced, seconds);
  return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
}
