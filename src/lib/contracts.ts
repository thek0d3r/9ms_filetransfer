import { z } from "zod";

export const fileDeclarationSchema = z.object({
  name: z.string().trim().min(1).max(255),
  size: z.number().int().positive(),
  type: z.string().max(255).default("application/octet-stream"),
});

export const createTransferSchema = z.object({
  title: z.string().trim().max(120).optional(),
  message: z.string().trim().max(2000).optional(),
  password: z.string()
    .min(8, "Password must be at least 8 characters.")
    .max(128, "Password must be at most 128 characters.")
    .optional(),
  files: z.array(fileDeclarationSchema).min(1),
});

export const multipartSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("init") }),
  z.object({ action: z.literal("list"), uploadId: z.string().min(1) }),
  z.object({ action: z.literal("sign"), uploadId: z.string().min(1), partNumbers: z.array(z.number().int().min(1).max(10_000)).min(1).max(100) }),
  z.object({
    action: z.literal("complete"),
    uploadId: z.string().min(1),
    parts: z.array(z.object({ partNumber: z.number().int().min(1), etag: z.string().min(1) })).min(1),
  }),
  z.object({ action: z.literal("abort"), uploadId: z.string().min(1) }),
]);

export const reportSchema = z.object({
  reason: z.enum(["malware", "copyright", "harassment", "illegal", "other"]),
  details: z.string().trim().max(1000).optional(),
});

export const createSecretSchema = z.object({
  secret: z.string().min(1).max(4096),
  label: z.string().trim().max(120).optional(),
});
