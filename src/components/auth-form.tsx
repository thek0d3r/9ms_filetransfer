"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
    });
    const body = await response.json().catch(() => ({})) as { error?: string; details?: { fieldErrors?: Record<string, string[]> } };
    if (!response.ok) {
      setError(Object.values(body.details?.fieldErrors ?? {}).flat()[0] || body.error || "Something went wrong.");
      setBusy(false);
      return;
    }
    location.href = "/account";
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      <p className="step-label">{mode === "login" ? "RETURNING / MEMBER" : "NEW / ACCOUNT"}</p>
      <h2>{mode === "login" ? <>Back in<br />nine milliseconds.</> : <>A longer lane<br />for bigger files.</>}</h2>
      <label><span>Email</span><input name="email" type="email" autoComplete="email" required maxLength={254} placeholder="you@example.com" /></label>
      <label><span>Password {mode === "register" && <i>10+ characters</i>}</span><input name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "register" ? 10 : 1} maxLength={128} required /></label>
      {error && <p className="form-notice" role="alert">{error}</p>}
      <button className="transfer-button" disabled={busy}><span>{busy ? "ONE MOMENT" : mode === "login" ? "SIGN IN" : "CREATE ACCOUNT"}</span><i>→</i></button>
      <p className="auth-switch">{mode === "login" ? <>No account? <Link href="/register">Create one</Link>.</> : <>Already registered? <Link href="/login">Sign in</Link>.</>}</p>
    </form>
  );
}
