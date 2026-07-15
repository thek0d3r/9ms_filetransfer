import { bigint, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["user", "admin"]);
export const userPlan = pgEnum("user_plan", ["free", "premium"]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: userRole("role").notNull().default("user"),
    plan: userPlan("plan").notNull().default("free"),
    stripeCustomerId: text("stripe_customer_id").unique(),
    stripeSubscriptionId: text("stripe_subscription_id").unique(),
    subscriptionStatus: text("subscription_status"),
    subscriptionPeriodEnd: timestamp("subscription_period_end", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  },
  (table) => [uniqueIndex("users_email_lower_idx").on(table.email)],
);

export const userSessions = pgTable(
  "user_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("user_sessions_user_expiry_idx").on(table.userId, table.expiresAt)],
);

export const transferStatus = pgEnum("transfer_status", [
  "uploading",
  "scanning",
  "ready",
  "quarantined",
  "expired",
  "deleted",
]);

export const fileStatus = pgEnum("file_status", ["pending", "uploading", "uploaded", "clean", "infected", "consumed"]);

export const transfers = pgTable(
  "transfers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    shareTokenHash: text("share_token_hash").notNull().unique(),
    manageTokenHash: text("manage_token_hash").notNull().unique(),
    title: text("title"),
    message: text("message"),
    passwordHash: text("password_hash"),
    status: transferStatus("status").notNull().default("uploading"),
    totalSize: bigint("total_size", { mode: "number" }).notNull(),
    fileCount: integer("file_count").notNull(),
    reportCount: integer("report_count").notNull().default(0),
    retentionHours: integer("retention_hours").notNull().default(168),
    scanPriority: integer("scan_priority").notNull().default(10),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    readyAt: timestamp("ready_at", { withTimezone: true }),
    firstDownloadedAt: timestamp("first_downloaded_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("transfers_status_expires_idx").on(table.status, table.expiresAt),
    index("transfers_owner_created_idx").on(table.ownerId, table.createdAt),
  ],
);

export const transferFiles = pgTable(
  "transfer_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    transferId: uuid("transfer_id").notNull().references(() => transfers.id, { onDelete: "cascade" }),
    objectKey: text("object_key").notNull().unique(),
    originalName: text("original_name").notNull(),
    mimeType: text("mime_type").notNull(),
    size: bigint("size", { mode: "number" }).notNull(),
    checksum: text("checksum"),
    status: fileStatus("status").notNull().default("pending"),
    uploadId: text("upload_id"),
    scannedAt: timestamp("scanned_at", { withTimezone: true }),
    downloadClaimedAt: timestamp("download_claimed_at", { withTimezone: true }),
    deleteAfter: timestamp("delete_after", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("transfer_files_transfer_idx").on(table.transferId),
    index("transfer_files_deletion_idx").on(table.status, table.deleteAfter),
  ],
);

export const abuseReports = pgTable(
  "abuse_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    transferId: uuid("transfer_id").notNull().references(() => transfers.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    details: text("details"),
    reporterHash: text("reporter_hash").notNull(),
    status: text("status").notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("abuse_reports_status_idx").on(table.status, table.createdAt)],
);

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  action: text("action").notNull(),
  transferId: uuid("transfer_id"),
  metadata: text("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const activityEvents = pgTable(
  "activity_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    ipHash: text("ip_hash"),
    metadata: text("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("activity_events_created_idx").on(table.createdAt),
    index("activity_events_user_created_idx").on(table.userId, table.createdAt),
  ],
);

export const stripeEvents = pgTable("stripe_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const oneTimeSecrets = pgTable(
  "one_time_secrets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tokenHash: text("token_hash").notNull().unique(),
    manageTokenHash: text("manage_token_hash").notNull().unique(),
    label: text("label"),
    ciphertext: text("ciphertext"),
    nonce: text("nonce"),
    authTag: text("auth_tag"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [index("one_time_secrets_expiry_idx").on(table.expiresAt, table.consumedAt)],
);

export type Transfer = typeof transfers.$inferSelect;
export type TransferFile = typeof transferFiles.$inferSelect;
export type User = typeof users.$inferSelect;
