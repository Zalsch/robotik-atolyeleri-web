"use client";

import { useState, type FormEvent } from "react";

export default function SignInForm() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: data.get("username"), password: data.get("password") }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "Giriş yapılamadı.");
      window.location.assign("/panel");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Giriş yapılamadı.");
      setBusy(false);
    }
  }

  return <form className="panel-form" onSubmit={onSubmit}>
    <label>Kullanıcı adı<input name="username" autoComplete="username" required minLength={3} maxLength={32} /></label>
    <label>Şifre<input name="password" type="password" autoComplete="current-password" required /></label>
    {error && <div className="panel-alert error" role="alert">{error}</div>}
    <button className="primary-button" type="submit" disabled={busy}>{busy ? "Giriş yapılıyor…" : "Giriş yap"}</button>
  </form>;
}
