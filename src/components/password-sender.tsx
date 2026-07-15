"use client";

import { useState } from "react";

type CreatedSecret = { id: string; shareUrl: string; manageToken: string; expiresAt: string };

function generatedPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return [...bytes].map((value) => alphabet[value % alphabet.length]).join("");
}

export function PasswordSender() {
  const [secret, setSecret] = useState("");
  const [label, setLabel] = useState("");
  const [created, setCreated] = useState<CreatedSecret | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function create() {
    if (!secret) return;
    setBusy(true); setNotice("");
    const response = await fetch("/api/secrets", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, label: label || undefined }),
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) { setNotice(body.error || "Could not create the link."); return; }
    setSecret("");
    setCreated(body);
  }

  async function copy() {
    if (!created) return;
    await navigator.clipboard.writeText(created.shareUrl);
    setNotice("One-time link copied.");
  }

  async function revoke() {
    if (!created) return;
    const response = await fetch(`/api/manage/secrets/${created.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${created.manageToken}` } });
    if (response.ok) { setNotice("Link revoked and secret destroyed."); setCreated(null); }
  }

  if (created) {
    return <section className="secret-card secret-complete" aria-live="polite">
      <div className="burn-icon" aria-hidden="true">1×</div>
      <p className="step-label">ARMED / ONE VIEW ONLY</p>
      <h2>Share it.<br />Then it vanishes.</h2>
      <p>The recipient must explicitly reveal it. After that, there is no second look.</p>
      <div className="share-field"><span>{created.shareUrl}</span><button type="button" onClick={copy}>COPY</button></div>
      <div className="complete-actions"><button type="button" onClick={() => setCreated(null)}>Create another</button><button type="button" onClick={revoke}>Revoke now</button></div>
      {notice && <p className="form-notice success">{notice}</p>}
    </section>;
  }

  return <section className="secret-card">
    <div className="card-index">/ SECRET 001</div>
    <p className="step-label">ONE-TIME PASSWORD LINK</p>
    <h2>What should<br />disappear?</h2>
    <label className="secret-input"><span>Password or secret</span><textarea autoFocus value={secret} maxLength={4096} onChange={(event) => setSecret(event.target.value)} placeholder="Paste a password, recovery code, or API token" /></label>
    <div className="generate-row"><span>{secret.length.toLocaleString()} / 4,096</span><button type="button" onClick={() => setSecret(generatedPassword())}>Generate strong password</button></div>
    <label className="secret-label"><span>Label <i>optional · visible before reveal</i></span><input value={label} maxLength={120} onChange={(event) => setLabel(event.target.value)} placeholder="Production database" /></label>
    <div className="secret-rules"><span><b>01</b> Expires in 24 hours</span><span><b>02</b> Opens exactly once</span><span><b>03</b> Encrypted at rest</span></div>
    {notice && <p className="form-notice">{notice}</p>}
    <button className="transfer-button" type="button" disabled={!secret || busy} onClick={create}><span>{busy ? "ENCRYPTING…" : "MAKE ONE-TIME LINK"}</span><i>↗</i></button>
  </section>;
}
