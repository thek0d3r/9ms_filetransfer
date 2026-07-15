import { z } from "zod";

const bool = z.enum(["true", "false"]).transform((value) => value === "true");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1).default("postgres://9ms:9ms@localhost:5432/9ms"),
  VALKEY_URL: z.string().min(1).default("redis://localhost:6379"),
  S3_ENDPOINT: z.url().optional(),
  S3_PUBLIC_ENDPOINT: z.url().optional(),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().default("9ms-transfers"),
  S3_ACCESS_KEY_ID: z.string().default("9ms"),
  S3_SECRET_ACCESS_KEY: z.string().default("change-me-now"),
  S3_FORCE_PATH_STYLE: bool.default(false),
  S3_SERVER_SIDE_ENCRYPTION: z.enum(["AES256", "none"]).default("AES256"),
  TOKEN_PEPPER: z.string().min(16).default("development-token-pepper-change-me"),
  COOKIE_SECRET: z.string().min(16).default("development-cookie-secret-change-me"),
  SECRET_ENCRYPTION_KEY: z.string().min(32).default("development-secret-encryption-key-change-me"),
  OPS_TOKEN: z.string().min(16).default("development-ops-token-change-me"),
  CLAMAV_HOST: z.string().default("localhost"),
  CLAMAV_PORT: z.coerce.number().int().positive().default(3310),
  CLAMAV_DISABLED: bool.default(false),
  CSAM_SHA256_DENYLIST: z.string().default(""),
  MAX_TRANSFER_BYTES: z.coerce.number().int().positive().default(2_147_483_648),
  MAX_FILES: z.coerce.number().int().min(1).max(1000).default(100),
  TRANSFER_TTL_HOURS: z.coerce.number().int().positive().default(168),
  UPLOAD_TTL_HOURS: z.coerce.number().int().positive().default(24),
  DOWNLOAD_URL_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
  CREATE_LIMIT_PER_HOUR: z.coerce.number().int().positive().default(12),
  PASSWORD_ATTEMPT_LIMIT: z.coerce.number().int().positive().default(10),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  PREMIUM_MAX_TRANSFER_BYTES: z.coerce.number().int().positive().default(21_474_836_480),
  PREMIUM_MONTHLY_BYTES: z.coerce.number().int().positive().default(53_687_091_200),
  PREMIUM_MAX_FILES: z.coerce.number().int().min(1).max(1000).default(250),
  PREMIUM_PRICE_EUR_CENTS: z.coerce.number().int().positive().default(1999),
  PREMIUM_ENABLED: bool.default(false),
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
  STRIPE_PREMIUM_PRICE_ID: z.string().min(1).optional(),
});

export const env = schema.parse(process.env);
