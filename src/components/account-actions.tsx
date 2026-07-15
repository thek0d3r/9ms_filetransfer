"use client";

import { useState } from "react";

export function BillingButton({ portal = false, children }: { portal?: boolean; children: React.ReactNode }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function go() {
    setBusy(true);
    setError("");
    const response = await fetch(`/api/billing/${portal ? "portal" : "checkout"}`, { method: "POST" });
    const body = await response.json().catch(() => ({})) as { url?: string; error?: string };
    if (!response.ok || !body.url) {
      setError(body.error || "Billing is unavailable.");
      setBusy(false);
      return;
    }
    location.href = body.url;
  }
  return <div className="action-with-error"><button className="dashboard-action" type="button" disabled={busy} onClick={go}>{busy ? "Opening…" : children}</button>{error && <small role="alert">{error}</small>}</div>;
}

export function LogoutButton() {
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    location.href = "/";
  }
  return <button className="quiet-action" type="button" onClick={logout}>Sign out</button>;
}

export function TransferDeleteButton({ id }: { id: string }) {
  const [busy, setBusy] = useState(false);
  async function remove() {
    if (!confirm("Delete this transfer and its stored files?")) return;
    setBusy(true);
    const response = await fetch(`/api/account/transfers/${id}`, { method: "DELETE" });
    if (response.ok) location.reload();
    else setBusy(false);
  }
  return <button className="table-action danger" type="button" disabled={busy} onClick={remove}>{busy ? "Deleting" : "Delete"}</button>;
}
