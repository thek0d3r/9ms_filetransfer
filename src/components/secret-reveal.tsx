"use client";

import { useState } from "react";

export function SecretReveal({ token, label, expiresAt }: { token: string; label: string | null; expiresAt: string }) {
  const [secret, setSecret] = useState<string | null>(null);
  const [state, setState] = useState<"ready" | "loading" | "revealed" | "gone">("ready");
  const [copied, setCopied] = useState(false);

  async function reveal() {
    setState("loading");
    const response = await fetch(`/api/secrets/${token}/reveal`, { method: "POST", cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { setState("gone"); return; }
    setSecret(body.secret);
    setState("revealed");
  }

  async function copy() {
    if (secret === null) return;
    await navigator.clipboard.writeText(secret);
    setCopied(true);
  }

  if (state === "gone") return <main className="reveal-shell"><section className="reveal-card gone"><p className="eyebrow"><span>410</span> Secret unavailable</p><h1>Already gone.</h1><p>This link was opened, expired, or revoked. 9ms cannot recover it.</p></section></main>;

  return <main className="reveal-shell">
    <section className="reveal-context"><p className="eyebrow"><span>ONE VIEW</span> Encrypted delivery</p><h1>{label || "A secret\nfor you."}</h1><p>Expires {new Date(expiresAt).toLocaleString()}</p></section>
    <section className={`reveal-card ${state === "revealed" ? "revealed" : ""}`}>
      {state === "revealed" ? <>
        <p className="step-label">REVEALED / PAY ATTENTION</p><h2>This is the<br />only view.</h2>
        <pre>{secret}</pre>
        <button className="transfer-button" type="button" onClick={copy}><span>{copied ? "COPIED — KEEP IT SAFE" : "COPY TO CLIPBOARD"}</span><i>□</i></button>
        <p className="reveal-warning">Refreshing or closing this page destroys your view.</p>
      </> : <>
        <div className="burn-icon" aria-hidden="true">1×</div>
        <p className="step-label">READY / NOT YET OPENED</p><h2>Look once.<br />Save it now.</h2>
        <p>This action permanently consumes the link. Preview bots do not count—only this button does.</p>
        <button className="transfer-button" type="button" disabled={state === "loading"} onClick={reveal}><span>{state === "loading" ? "OPENING…" : "REVEAL ONCE"}</span><i>→</i></button>
      </>}
    </section>
  </main>;
}
