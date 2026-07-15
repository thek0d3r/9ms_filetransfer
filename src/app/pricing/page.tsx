import Link from "next/link";
import { BillingButton } from "@/components/account-actions";
import { currentUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { formatBytes, formatEuro, hasPremiumAccess } from "@/lib/plans";

export const metadata = { title: "Premium" };

export default async function PricingPage() {
  const account = await currentUser();
  const premium = hasPremiumAccess(account?.user);
  return (
    <main className="pricing-shell">
      <section className="pricing-intro"><p className="eyebrow"><span>05</span> Premium velocity</p><h1>MORE<br /><em>ROOM.</em></h1><p>Bigger uploads without an unlimited-cost trap.<br />One clear plan, cancel whenever you want.</p><div className="pricing-orbit" aria-hidden="true"><span>10</span><small>GB / SEND</small></div></section>
      <section className="price-grid" aria-label="Plans">
        <article className="price-card"><p className="step-label">FREE / ALWAYS</p><h2>2 GB</h2><strong>€0</strong><ul><li>2 GB per transfer</li><li>7-day expiry</li><li>Password protection</li><li>One-time downloads</li></ul>{account ? <Link className="dashboard-action secondary" href="/">Send files</Link> : <Link className="dashboard-action secondary" href="/register">Create free account</Link>}</article>
        <article className="price-card premium-card"><div className="price-ribbon">10× THE HEADROOM</div><p className="step-label">PREMIUM / MONTHLY</p><h2>{formatBytes(env.PREMIUM_MAX_TRANSFER_BYTES)}</h2><strong>{formatEuro(env.PREMIUM_PRICE_EUR_CENTS)}<small>/month</small></strong><ul><li>10 GB per transfer</li><li>50 GB uploads each month</li><li>Account transfer history</li><li>Stripe billing controls</li></ul>{premium ? <Link className="dashboard-action" href="/account">Premium active</Link> : !env.PREMIUM_ENABLED ? <span className="dashboard-action disabled-action">Coming soon</span> : account ? <BillingButton>Upgrade with Stripe →</BillingButton> : <Link className="dashboard-action" href="/register">Create account to upgrade</Link>}<p className="price-note">Quota resets at 00:00 UTC on the first day of each month. Price may include applicable tax at checkout.</p></article>
      </section>
    </main>
  );
}
