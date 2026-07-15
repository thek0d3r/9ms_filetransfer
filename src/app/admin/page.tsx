import { desc, eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { abuseReports, activityEvents, transfers, users } from "@/lib/db/schema";
import { formatBytes } from "@/lib/plans";

export const metadata = { title: "Admin" };

function date(value: Date | null) {
  return value ? new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(value) : "—";
}

export default async function AdminPage() {
  const account = await currentUser();
  if (!account || account.user.role !== "admin") redirect("/");
  const [[userStats], [transferStats], [reportStats], recentUsers, recentTransfers, events] = await Promise.all([
    db.select({ total: sql<string>`count(*)`, premium: sql<string>`count(*) filter (where ${users.plan} = 'premium')` }).from(users),
    db.select({ total: sql<string>`count(*)`, bytes: sql<string>`coalesce(sum(${transfers.totalSize}), 0)` }).from(transfers),
    db.select({ open: sql<string>`count(*) filter (where ${abuseReports.status} = 'open')` }).from(abuseReports),
    db.select({ id: users.id, email: users.email, plan: users.plan, status: users.subscriptionStatus, createdAt: users.createdAt, lastLoginAt: users.lastLoginAt }).from(users).orderBy(desc(users.createdAt)).limit(20),
    db.select({ id: transfers.id, title: transfers.title, status: transfers.status, totalSize: transfers.totalSize, fileCount: transfers.fileCount, createdAt: transfers.createdAt, email: users.email }).from(transfers).leftJoin(users, eq(transfers.ownerId, users.id)).orderBy(desc(transfers.createdAt)).limit(20),
    db.select({ id: activityEvents.id, action: activityEvents.action, ipHash: activityEvents.ipHash, metadata: activityEvents.metadata, createdAt: activityEvents.createdAt, email: users.email }).from(activityEvents).leftJoin(users, eq(activityEvents.userId, users.id)).orderBy(desc(activityEvents.createdAt)).limit(30),
  ]);
  return (
    <main className="admin-shell">
      <header className="admin-head"><div><p className="eyebrow"><span>07</span> Operator telemetry</p><h1>CONTROL<br /><em>ROOM.</em></h1></div><p>Read-only product activity.<br />No file contents. No raw IP addresses.</p></header>
      <section className="metric-strip"><article><span>USERS</span><strong>{userStats.total}</strong></article><article><span>PREMIUM</span><strong>{userStats.premium}</strong></article><article><span>TRANSFERS</span><strong>{transferStats.total}</strong></article><article><span>DECLARED BYTES</span><strong>{formatBytes(Number(transferStats.bytes))}</strong></article><article className={Number(reportStats.open) ? "alert-metric" : ""}><span>OPEN REPORTS</span><strong>{reportStats.open}</strong></article></section>
      <section className="admin-columns"><article><div className="section-heading"><div><p className="step-label">LATEST ACCOUNTS</p><h2>People.</h2></div></div><div className="compact-table">{recentUsers.map((user) => <div key={user.id}><span><b>{user.email}</b><small>joined {date(user.createdAt)}</small></span><span className={`plan-pill ${user.plan}`}>{user.plan}</span><time>{user.lastLoginAt ? `seen ${date(user.lastLoginAt)}` : "never signed in"}</time></div>)}</div></article><article><div className="section-heading"><div><p className="step-label">LATEST TRANSFERS</p><h2>Traffic.</h2></div></div><div className="compact-table">{recentTransfers.map((transfer) => <div key={transfer.id}><span><b>{transfer.title || "Untitled"}</b><small>{transfer.email || "anonymous"}</small></span><span>{formatBytes(transfer.totalSize)} / {transfer.fileCount} files</span><span><i className={`status-dot status-${transfer.status}`} />{transfer.status}</span></div>)}</div></article></section>
      <section className="event-section"><div className="section-heading"><div><p className="step-label">ACCOUNT EVENT FEED</p><h2>Signals, not surveillance.</h2></div></div><div className="event-feed">{events.map((event) => <div key={event.id}><time>{date(event.createdAt)}</time><strong>{event.action}</strong><span>{event.email || "system / anonymous"}</span><code>{event.ipHash ? `${event.ipHash.slice(0, 12)}…` : "—"}</code></div>)}</div></section>
    </main>
  );
}
