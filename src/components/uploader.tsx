"use client";

import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";

type CreatedFile = { id: string; name: string; size: number };
type Session = {
  transferId: string;
  shareToken: string;
  manageToken: string;
  shareUrl: string;
  files: CreatedFile[];
  status: "uploading" | "scanning" | "ready";
  fingerprints: string[];
};

const MAX_BYTES = 2 * 1024 * 1024 * 1024;

function bytes(value: number) {
  if (value === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** index).toFixed(index > 1 ? 1 : 0)} ${units[index]}`;
}

function fingerprint(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

async function jsonRequest<T>(url: string, init: RequestInit = {}) {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init.headers } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((body as { error?: string }).error || "Request failed");
  return body as T;
}

function uploadPart(url: string, blob: Blob, onProgress: (loaded: number) => void, register: (xhr: XMLHttpRequest) => void) {
  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    register(xhr);
    xhr.open("PUT", url);
    xhr.upload.onprogress = (event) => onProgress(event.loaded);
    xhr.onerror = () => reject(new Error("Network error while uploading"));
    xhr.onabort = () => reject(new Error("Upload cancelled"));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const etag = xhr.getResponseHeader("ETag");
        if (!etag) reject(new Error("Storage did not return an ETag. Check the bucket CORS policy."));
        else resolve(etag);
      } else reject(new Error(`Storage rejected a part (${xhr.status})`));
    };
    xhr.send(blob);
  });
}

export function Uploader() {
  const inputRef = useRef<HTMLInputElement>(null);
  const resumeRef = useRef<HTMLInputElement>(null);
  const activeXhrs = useRef<Set<XMLHttpRequest>>(new Set());
  const [files, setFiles] = useState<File[]>([]);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [password, setPassword] = useState("");
  const [stage, setStage] = useState<"compose" | "uploading" | "scanning" | "complete" | "error">("compose");
  const [progress, setProgress] = useState(0);
  const [notice, setNotice] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [savedSession, setSavedSession] = useState<Session | null>(null);
  const totalSize = useMemo(() => files.reduce((sum, file) => sum + file.size, 0), [files]);

  useEffect(() => {
    const saved = localStorage.getItem("9ms:active-transfer");
    if (saved) {
      try {
        const value = JSON.parse(saved) as Session;
        setSavedSession(value);
        if (value.status === "scanning") void waitForScan(value);
      } catch { localStorage.removeItem("9ms:active-transfer"); }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (stage === "uploading") event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [stage]);

  function addFiles(incoming: File[]) {
    setNotice("");
    setFiles((current) => {
      const unique = new Map(current.map((file) => [fingerprint(file), file]));
      for (const file of incoming) unique.set(fingerprint(file), file);
      const next = [...unique.values()];
      if (next.length > 100) setNotice("A transfer can hold up to 100 files.");
      if (next.reduce((sum, file) => sum + file.size, 0) > MAX_BYTES) setNotice("That selection exceeds the 2 GB transfer limit.");
      return next.slice(0, 100);
    });
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    addFiles([...event.dataTransfer.files]);
  }

  function onSelect(event: ChangeEvent<HTMLInputElement>) {
    addFiles([...(event.target.files ?? [])]);
    event.target.value = "";
  }

  async function withRetries<T>(operation: () => Promise<T>, attempts = 3): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < attempts; attempt++) {
      try { return await operation(); } catch (error) {
        lastError = error;
        await new Promise((resolve) => setTimeout(resolve, 750 * 2 ** attempt));
      }
    }
    throw lastError;
  }

  async function uploadFile(file: File, remote: CreatedFile, active: Session, loadedByFile: Map<string, number>) {
    const endpoint = `/api/transfers/${active.transferId}/files/${remote.id}/multipart`;
    const auth = { Authorization: `Bearer ${active.manageToken}` };
    const init = await jsonRequest<{ uploadId: string; partSize: number }>(endpoint, {
      method: "POST", headers: auth, body: JSON.stringify({ action: "init" }),
    });
    const existing = await jsonRequest<{ parts: { partNumber: number; etag: string; size: number }[] }>(endpoint, {
      method: "POST", headers: auth, body: JSON.stringify({ action: "list", uploadId: init.uploadId }),
    });
    const completed = new Map(existing.parts.map((part) => [part.partNumber, { partNumber: part.partNumber, etag: part.etag }]));
    loadedByFile.set(remote.id, existing.parts.reduce((sum, part) => sum + part.size, 0));
    const partCount = Math.ceil(file.size / init.partSize);
    const missing = Array.from({ length: partCount }, (_, index) => index + 1).filter((part) => !completed.has(part));
    const urls = new Map<number, string>();
    for (let offset = 0; offset < missing.length; offset += 50) {
      const signed = await jsonRequest<{ urls: { partNumber: number; url: string }[] }>(endpoint, {
        method: "POST", headers: auth, body: JSON.stringify({ action: "sign", uploadId: init.uploadId, partNumbers: missing.slice(offset, offset + 50) }),
      });
      signed.urls.forEach((item) => urls.set(item.partNumber, item.url));
    }
    let cursor = 0;
    const partProgress = new Map<number, number>();
    const workers = Array.from({ length: Math.min(3, missing.length) }, async () => {
      while (cursor < missing.length) {
        const partNumber = missing[cursor++];
        const start = (partNumber - 1) * init.partSize;
        const blob = file.slice(start, Math.min(file.size, start + init.partSize));
        const etag = await withRetries(() => uploadPart(urls.get(partNumber)!, blob, (loaded) => {
          partProgress.set(partNumber, loaded);
          const base = existing.parts.reduce((sum, part) => sum + part.size, 0);
          loadedByFile.set(remote.id, base + [...partProgress.values()].reduce((sum, value) => sum + value, 0));
          const totalLoaded = [...loadedByFile.values()].reduce((sum, value) => sum + value, 0);
          setProgress(Math.min(99, Math.round((totalLoaded / totalSize) * 100)));
        }, (xhr) => {
          activeXhrs.current.add(xhr);
          xhr.addEventListener("loadend", () => activeXhrs.current.delete(xhr));
        }));
        completed.set(partNumber, { partNumber, etag });
      }
    });
    await Promise.all(workers);
    await jsonRequest(endpoint, {
      method: "POST", headers: auth,
      body: JSON.stringify({ action: "complete", uploadId: init.uploadId, parts: [...completed.values()].sort((a, b) => a.partNumber - b.partNumber) }),
    });
  }

  async function runUpload(active: Session, localFiles: File[]) {
    setSession(active);
    setStage("uploading");
    setNotice("");
    const loadedByFile = new Map<string, number>();
    for (const remote of active.files) {
      const local = localFiles.find((file) => file.name === remote.name && file.size === remote.size);
      if (!local) throw new Error(`Reselect “${remote.name}” to resume this transfer.`);
      await uploadFile(local, remote, active, loadedByFile);
    }
    setProgress(100);
    await jsonRequest(`/api/transfers/${active.transferId}/finalize`, {
      method: "POST", headers: { Authorization: `Bearer ${active.manageToken}` }, body: "{}",
    });
    const scanning = { ...active, status: "scanning" as const };
    localStorage.setItem("9ms:active-transfer", JSON.stringify(scanning));
    await waitForScan(scanning);
  }

  async function start() {
    if (!files.length || totalSize > MAX_BYTES || files.some((file) => file.size === 0)) {
      setNotice(files.some((file) => file.size === 0) ? "Empty files cannot be transferred." : "Choose files within the 2 GB limit.");
      return;
    }
    try {
      const created = await jsonRequest<Omit<Session, "status" | "fingerprints">>("/api/transfers", {
        method: "POST",
        body: JSON.stringify({ title: title || undefined, message: message || undefined, password: password || undefined, files: files.map((file) => ({ name: file.name, size: file.size, type: file.type })) }),
      });
      const active: Session = { ...created, status: "uploading", fingerprints: files.map(fingerprint) };
      localStorage.setItem("9ms:active-transfer", JSON.stringify(active));
      await runUpload(active, files);
    } catch (error) {
      setStage("error");
      setNotice(error instanceof Error ? error.message : "The transfer failed.");
    }
  }

  async function waitForScan(active: Session) {
    setSession(active);
    setStage("scanning");
    for (let attempt = 0; attempt < 300; attempt++) {
      const status = await jsonRequest<{ status: string }>(`/api/transfers/${active.transferId}/status`, { headers: { Authorization: `Bearer ${active.manageToken}` } });
      if (status.status === "ready") {
        const ready = { ...active, status: "ready" as const };
        setSession(ready);
        setStage("complete");
        setSavedSession(null);
        localStorage.removeItem("9ms:active-transfer");
        return;
      }
      if (["quarantined", "deleted", "expired"].includes(status.status)) throw new Error("This transfer could not be made available.");
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
    throw new Error("Scanning is taking longer than expected. You can safely return later.");
  }

  async function resumeSelected(event: ChangeEvent<HTMLInputElement>) {
    const selected = [...(event.target.files ?? [])];
    event.target.value = "";
    if (!savedSession) return;
    try { await runUpload(savedSession, selected); }
    catch (error) { setStage("error"); setNotice(error instanceof Error ? error.message : "Resume failed."); }
  }

  function cancel() {
    activeXhrs.current.forEach((xhr) => xhr.abort());
    activeXhrs.current.clear();
    setStage("error");
    setNotice("Upload paused. Reselect the same files to resume it.");
    setSavedSession(session);
  }

  async function copyLink() {
    if (!session) return;
    await navigator.clipboard.writeText(session.shareUrl);
    setNotice("Link copied to clipboard.");
  }

  async function deleteTransfer() {
    if (!session || !confirm("Delete this transfer now? This cannot be undone.")) return;
    const response = await fetch(`/api/manage/transfers/${session.transferId}`, { method: "DELETE", headers: { Authorization: `Bearer ${session.manageToken}` } });
    if (!response.ok) { setNotice("The transfer could not be deleted."); return; }
    setNotice("Transfer deleted.");
    setTimeout(() => location.reload(), 900);
  }

  if (stage === "uploading" || stage === "scanning") {
    return (
      <section className="transfer-card progress-card" aria-live="polite">
        <div className="progress-orbit" style={{ "--progress": `${progress * 3.6}deg` } as React.CSSProperties}>
          <div><strong>{stage === "scanning" ? "✓" : progress}</strong><span>{stage === "scanning" ? "UPLOAD" : "%"}</span></div>
        </div>
        <p className="step-label">{stage === "scanning" ? "02 / SAFETY CHECK" : "01 / MOVING BYTES"}</p>
        <h2>{stage === "scanning" ? "Checking every file." : "Keep this tab close."}</h2>
        <p>{stage === "scanning" ? "Your link appears as soon as the clean scan finishes." : `${bytes(totalSize)} headed straight to storage.`}</p>
        {stage === "uploading" && <button className="text-button" type="button" onClick={cancel}>Pause upload</button>}
      </section>
    );
  }

  if (stage === "complete" && session) {
    return (
      <section className="transfer-card complete-card" aria-live="polite">
        <p className="step-label">03 / READY TO GO</p>
        <div className="complete-mark">09</div>
        <h2>Link. Copy. Gone.</h2>
        <p>Your files will disappear automatically in seven days.</p>
        <div className="share-field"><span>{session.shareUrl}</span><button type="button" onClick={copyLink}>COPY</button></div>
        <div className="complete-actions">
          <a href={session.shareUrl}>Open transfer</a>
          <button type="button" onClick={() => location.reload()}>Send more</button>
          <button type="button" onClick={deleteTransfer}>Delete now</button>
        </div>
        {notice && <p className="form-notice success">{notice}</p>}
      </section>
    );
  }

  return (
    <section className="transfer-card" aria-labelledby="upload-title">
      <div className="card-index">/ 001</div>
      <div className="drop-zone" onDrop={onDrop} onDragOver={(event) => event.preventDefault()}>
        <input ref={inputRef} type="file" multiple hidden onChange={onSelect} />
        <button className="add-button" type="button" onClick={() => inputRef.current?.click()} aria-label="Choose files">+</button>
        <div><p className="step-label">DROP ZONE</p><h2 id="upload-title">Put files here.</h2><p>or <button type="button" onClick={() => inputRef.current?.click()}>choose from your device</button></p></div>
      </div>

      {savedSession && savedSession.status === "uploading" && (
        <div className="resume-banner">
          <span>Unfinished transfer found.</span>
          <button type="button" onClick={() => resumeRef.current?.click()}>Reselect & resume</button>
          <input ref={resumeRef} type="file" multiple hidden onChange={resumeSelected} />
        </div>
      )}

      {files.length > 0 && (
        <div className="file-stack">
          <div className="file-summary"><strong>{files.length} file{files.length === 1 ? "" : "s"}</strong><span>{bytes(totalSize)} / 2 GB</span></div>
          <ul>{files.map((file) => <li key={fingerprint(file)}><span>{file.name}</span><small>{bytes(file.size)}</small><button type="button" aria-label={`Remove ${file.name}`} onClick={() => setFiles((current) => current.filter((item) => fingerprint(item) !== fingerprint(file)))}>×</button></li>)}</ul>
        </div>
      )}

      <div className="transfer-fields">
        <label><span>Title <i>optional</i></span><input value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} placeholder="Quarterly cut" /></label>
        <label><span>Message <i>optional</i></span><textarea value={message} maxLength={2000} onChange={(event) => setMessage(event.target.value)} placeholder="A little context goes a long way." /></label>
        <label><span>Password <i>optional · 8+ chars</i></span><input type="password" value={password} minLength={8} maxLength={128} onChange={(event) => setPassword(event.target.value)} placeholder="Keep it between us" /></label>
      </div>
      {notice && <p className="form-notice">{notice}</p>}
      <button className="transfer-button" type="button" disabled={!files.length || totalSize > MAX_BYTES} onClick={start}><span>MAKE THE LINK</span><i>↗</i></button>
      <p className="fine-print">By transferring, you agree to our Terms. Files expire 7 days after the safety check.</p>
    </section>
  );
}
