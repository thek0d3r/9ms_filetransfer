import type { Metadata } from "next";
import { PasswordSender } from "@/components/password-sender";

export const metadata: Metadata = { title: "Share a password" };

export default function PasswordPage() {
  return <main className="password-shell">
    <section className="password-intro">
      <p className="eyebrow"><span>02</span> One-time secrets</p>
      <h1>SEEN ONCE.<br /><em>GONE.</em></h1>
      <p className="hero-lede">Passwords shouldn’t linger in chat.<br />Give them one clean exit.</p>
      <div className="one-time-diagram" aria-hidden="true"><span>YOU</span><i>→</i><b>1×</b><i>→</i><span>THEM</span><i>→</i><strong>×</strong></div>
    </section>
    <PasswordSender />
  </main>;
}
