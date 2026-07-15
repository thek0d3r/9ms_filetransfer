"use client";

import { FormEvent, useState } from "react";

type FileItem = { id: string; name: string; size: number };

function bytes(value: number) {
  const units = ["B", "KB", "MB", "GB"];
  const index = value ? Math.min(Math.floor(Math.log(value) / Math.log(1024)), 3) : 0;
  return `${(value / 1024 ** index).toFixed(index > 1 ? 1 : 0)} ${units[index]}`;
}

export function Recipient({ token, title, message, totalSize, fileCount, expiresAt, locked, initialFiles }: {
  token: string;
  title: string | null;
  message: string | null;
  totalSize: number;
  fileCount: number;
  expiresAt: string;
  locked: boolean;
  initialFiles: FileItem[];
}) {
  const [isLocked, setLocked] = useState(locked);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [reporting, setReporting] = useState(false);
  const [reported, setReported] = useState(false);

  async function unlock(event: FormEvent) {
    event.preventDefault();
    setError("");
    const response = await fetch(`/api/share/${token}/unlock`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error || "Could not unlock this transfer.");
      return;
    }
    location.reload();
  }

  async function report(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const response = await fetch(`/api/share/${token}/report`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: data.get("reason"), details: data.get("details") || undefined }),
    });
    if (response.ok) { setReported(true); setReporting(false); }
  }

  return (
    <main className="recipient-shell">
      <section className="recipient-intro">
        <p className="eyebrow"><span>INCOMING</span> One temporary link</p>
        <h1>{title || "A transfer\nfor you."}</h1>
        <div className="recipient-meta"><span>{fileCount} FILE{fileCount === 1 ? "" : "S"}</span><span>{bytes(totalSize)}</span><span>UNTIL {new Date(expiresAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }).toUpperCase()}</span></div>
        {message && !isLocked && <blockquote>“{message}”</blockquote>}
      </section>

      <section className="download-panel">
        {isLocked ? (
          <form className="unlock-form" onSubmit={unlock}>
            <div className="lock-glyph" aria-hidden="true"><span /></div>
            <p className="step-label">PASSWORD PROTECTED</p>
            <h2>Good link.<br />One more thing.</h2>
            <label><span>Transfer password</span><input autoFocus type="password" minLength={8} maxLength={128} autoComplete="current-password" placeholder="Enter 8+ characters" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
            {error && <p className="form-notice" role="alert">{error}</p>}
            <button className="transfer-button" type="submit"><span>UNLOCK FILES</span><i aria-hidden="true">→</i></button>
          </form>
        ) : (
          <>
            <div className="download-heading"><div><p className="step-label">READY / VERIFIED CLEAN</p><h2>Everything,<br />right here.</h2></div><a className="download-all" href={`/api/share/${token}/download-all`}><span>DOWNLOAD ALL</span><i>↓</i></a></div>
            <ul className="download-list">
              {initialFiles.map((file, index) => <li key={file.id}><b>{String(index + 1).padStart(2, "0")}</b><span>{file.name}<small>{bytes(file.size)}</small></span><a aria-label={`Download ${file.name}`} href={`/api/share/${token}/files/${file.id}`}>↓</a></li>)}
            </ul>
          </>
        )}
        <div className="panel-foot"><span>One download only. Files delete after download or expiry.</span><button type="button" onClick={() => setReporting(true)}>Report transfer</button></div>
      </section>

      {reporting && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setReporting(false)}>
          <form className="report-modal" onSubmit={report} onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" type="button" onClick={() => setReporting(false)}>×</button>
            <p className="step-label">REPORT ABUSE</p><h2>Tell us what’s wrong.</h2>
            <label><span>Reason</span><select name="reason" defaultValue="child_safety"><option value="child_safety">Child safety concern</option><option value="malware">Malware or phishing</option><option value="copyright">Copyright infringement</option><option value="harassment">Harassment</option><option value="illegal">Illegal content</option><option value="other">Other</option></select></label>
            <label><span>Details <i>optional</i></span><textarea name="details" maxLength={1000} /></label>
            <button className="transfer-button" type="submit"><span>SEND REPORT</span><i>→</i></button>
          </form>
        </div>
      )}
      {reported && <div className="toast" role="status">Report received. Thank you.</div>}
    </main>
  );
}
