"use client";

import { useState } from "react";

type Props = {
  userId: string;
  plan: "free" | "premium";
  status: string | null;
};

export function AdminPlanControl({ userId, plan, status }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const manuallyGranted = plan === "premium" && status === "admin_granted";
  const paidPremium = plan === "premium" && !manuallyGranted;

  async function updatePlan() {
    if (manuallyGranted && !confirm("Revoke this manually granted Premium access?")) return;
    setBusy(true);
    setError("");
    const response = await fetch(`/api/admin/users/${userId}/premium`, {
      method: manuallyGranted ? "DELETE" : "POST",
    });
    const body = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) {
      setError(body.error || "Could not update this account.");
      setBusy(false);
      return;
    }
    location.reload();
  }

  return (
    <span className="admin-plan-control">
      <span className={`plan-pill ${plan}`}>{manuallyGranted ? "premium · grant" : plan}</span>
      {paidPremium ? <small>Stripe managed</small> : <button type="button" disabled={busy} onClick={updatePlan}>{busy ? "Working…" : manuallyGranted ? "Revoke" : "Grant Premium"}</button>}
      {error && <small className="admin-plan-error" role="alert">{error}</small>}
    </span>
  );
}
