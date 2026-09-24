"use client";

import { useEffect, useState } from "react";

type Status = { configured: boolean; pending: number; failed: number };

export default function AdminSyncStatus() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function refresh() {
    const response = await fetch("/api/integrations/attendance", { cache: "no-store" });
    if (!response.ok) throw new Error("Aktarım durumu alınamadı.");
    setStatus(await response.json() as Status);
  }

  useEffect(() => { void refresh().catch(() => setMessage("Aktarım durumu alınamadı.")); }, []);

  async function retry() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/integrations/attendance", { method: "POST" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "Yeniden deneme başarısız.");
      await refresh();
      setMessage(result.failed ? "Bazı kayıtlar henüz aktarılamadı; tekrar denenecek." : "Bekleyen aktarım denendi.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Yeniden deneme başarısız."); }
    finally { setBusy(false); }
  }

  return <section className="surface-card panel-card" aria-label="Yoklama aktarımı">
    <div className="panel-list-heading"><h2>Yoklama aktarımı</h2></div>
    {status ? <>
      <p className="panel-empty">Google E-Tablo: {status.configured ? "Bağlı" : "Kurulum bekliyor"} · Bekleyen: {status.pending} · Hatalı: {status.failed}</p>
      {status.configured && status.pending > 0 && <button type="button" className="secondary-button" disabled={busy} onClick={() => void retry()}>Aktarımı yeniden dene</button>}
    </> : <p className="panel-empty">Durum yükleniyor…</p>}
    {message && <p role="status" className="panel-empty">{message}</p>}
  </section>;
}
