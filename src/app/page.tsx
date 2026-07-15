import { currentUser } from "@/lib/auth";
import { Uploader } from "@/components/uploader";
import { formatBytes, planLimits } from "@/lib/plans";

export default async function HomePage() {
  const account = await currentUser();
  const limits = planLimits(account?.user);
  return (
    <main className="home-shell">
      <section className="hero-copy" aria-labelledby="hero-title">
        <p className="eyebrow"><span>01</span> Temporary file transfer</p>
        <h1 id="hero-title">SEND IT<br /><em>NOW.</em></h1>
        <p className="hero-lede">No account. No inbox archaeology.<br />Just files, a link, and seven days.</p>
        <div className="speed-note" aria-hidden="true">
          <span>9ms</span>
          <svg viewBox="0 0 180 28"><path d="M2 21C38 3 78 2 112 15c23 9 43 8 66-7" /></svg>
          <small>is a feeling,<br />not a benchmark.</small>
        </div>
      </section>
      <Uploader maxBytes={limits.maxTransferBytes} maxFiles={limits.maxFiles} plan={limits.plan} />
      <footer className="home-footer">
        <span>UP TO {formatBytes(limits.maxTransferBytes)}</span><span>{limits.plan === "premium" ? "UP TO 30 DAYS" : "7 DAY EXPIRY"}</span><span>OPTIONAL PASSWORD</span>
      </footer>
    </main>
  );
}
