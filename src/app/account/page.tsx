import { and, desc, eq, gte, sql } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BillingButton, LogoutButton, TransferDeleteButton } from "@/components/account-actions";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { activityEvents, transfers } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { formatBytes, formatEuro, hasPremiumAccess, monthStart } from "@/lib/plans";

export const metadata = { title: "Account" };

function date(value: Date | null) {
  return value ? new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(value) : "—";
}

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ billing?: string }> }) {
  const account = await currentUser();
  if (!account) redirect("/login");
  const premium = hasPremiumAccess(account.user);
  const [usage] = await db.select({ total: sql<string>`coalesce(sum(${transfers.totalSize}), 0)` })
    .from(transfers).where(and(eq(transfers.ownerId, account.user.id), gte(transfers.createdAt, monthStart())));
  const history = await db.select().from(transfers).where(eq(transfers.ownerId, account.user.id)).orderBy(desc(transfers.createdAt)).limit(25);
  const events = await db.select().from(activityEvents).where(eq(activityEvents.userId, account.user.id)).orderBy(desc(activityEvents.createdAt)).limit(8);
  const used = Number(usage?.total ?? 0);
  const allowance = premium ? env.PREMIUM_MONTHLY_BYTES : null;
  const percentage = allowance ? Math.min(100, Math.round(used / allowance * 100)) : 0;
  const billing = (await searchParams).billing;
  return (
    <main className="dashboard-shell">
      <header className="dashboard-hero"><div><p className="eyebrow"><span>06</span> Account telemetry</p><h1>YOUR<br />DASH.</h1></div><div className="identity-block"><span>{premium ? "PREMIUM" : "FREE"}</span><strong>{account.user.email}</strong><small>Member since {date(account.user.createdAt)}</small><LogoutButton /></div></header>
      {billing === "success" && <div className="dashboard-notice">Payment received. Stripe is confirming your Premium access now.</div>}
      <section className="dashboard-grid">
        <article className="usage-card"><p className="step-label">THIS MONTH / DECLARED UPLOADS</p><strong>{formatBytes(used)}</strong><div className="usage-track"><i style={{ width: `${percentage}%` }} /></div><p>{allowance ? `${formatBytes(Math.max(0, allowance - used))} remaining of ${formatBytes(allowance)}` : "Free accounts have no monthly quota; each transfer is capped at 2 GB."}</p></article>
        <article className={`plan-card ${premium ? "is-premium" : ""}`}><p className="step-label">CURRENT PLAN</p><strong>{premium ? "20 GB" : "2 GB"}<small> / transfer</small></strong><p>{premium ? `${formatEuro(env.PREMIUM_PRICE_EUR_CENTS)} per month · 250 files · 30-day option` : "Need to move something bigger? Premium opens the 20 GB lane."}</p>{premium ? <BillingButton portal>Manage billing</BillingButton> : env.PREMIUM_ENABLED ? <BillingButton>Upgrade to Premium →</BillingButton> : <span className="dashboard-action disabled-action">Premium coming soon</span>}</article>
        <article className="activity-card"><p className="step-label">RECENT ACTIVITY</p><ol>{events.map((event) => <li key={event.id}><span>{event.action.replaceAll(".", " / ")}</span><time>{date(event.createdAt)}</time></li>)}{!events.length && <li><span>No activity yet.</span></li>}</ol></article>
      </section>
      <section className="history-section"><div className="section-heading"><div><p className="step-label">TRANSFER HISTORY / LAST 25</p><h2>Everything you sent.</h2></div><Link className="dashboard-action" href="/">New transfer →</Link></div><div className="data-table"><div className="data-row data-head"><span>Transfer</span><span>Size</span><span>Status</span><span>Created</span><span /></div>{history.map((transfer) => { const displayStatus = transfer.firstDownloadedAt ? "delivered" : transfer.status; return <div className="data-row" key={transfer.id}><span><b>{transfer.title || "Untitled transfer"}</b><small>{transfer.fileCount} file{transfer.fileCount === 1 ? "" : "s"}{transfer.firstDownloadedAt ? ` · first download ${date(transfer.firstDownloadedAt)}` : ` · ${transfer.retentionHours / 24} day link`}</small></span><span>{formatBytes(transfer.totalSize)}</span><span><i className={`status-dot status-${displayStatus}`} />{displayStatus}</span><time>{date(transfer.createdAt)}</time><span>{!["deleted", "expired", "quarantined"].includes(transfer.status) && <TransferDeleteButton id={transfer.id} />}</span></div>; })}{!history.length && <div className="empty-row">No account transfers yet. Anonymous transfers are not retroactively linked.</div>}</div></section>
    </main>
  );
}
