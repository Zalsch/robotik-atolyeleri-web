"use client";

import { useEffect, useState } from "react";

function applicationServerKey(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

async function subscriptionRequest(method: "POST" | "DELETE", subscription: PushSubscription) {
  const serialized = subscription.toJSON();
  const response = await fetch("/api/push/subscriptions", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: subscription.endpoint, p256dh: serialized.keys?.p256dh, auth: serialized.keys?.auth }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? "Bildirim ayarı kaydedilemedi.");
  }
}

export async function unsubscribeFromPushOnSignOut() {
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return;
  const subscription = await registration.pushManager?.getSubscription();
  if (!subscription) return;
  try { await subscriptionRequest("DELETE", subscription); }
  finally { await subscription.unsubscribe(); }
}

export default function PushSubscriptionClient() {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const available = window.isSecureContext && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setSupported(available);
    if (!available) return;
    void fetch("/api/push/config", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((result) => setPublicKey(result?.publicKey ?? null))
      .catch(() => {});
    void navigator.serviceWorker.ready.then((registration) => registration.pushManager.getSubscription())
      .then(async (subscription) => {
        if (!subscription) return;
        const response = await fetch("/api/push/subscriptions/status", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        if (!response.ok) throw new Error("Bildirim durumu okunamadı.");
        const result = await response.json();
        setSubscribed(result.subscribed === true);
      })
      .catch(() => setMessage("Bildirim durumu okunamadı. Yeniden etkinleştirebilirsiniz."))
      .finally(() => setChecking(false));
  }, []);

  async function toggle() {
    setBusy(true); setMessage("");
    try {
      const registration = await navigator.serviceWorker.ready;
      const current = await registration.pushManager.getSubscription();
      if (subscribed && current) {
        await subscriptionRequest("DELETE", current);
        await current.unsubscribe();
        setSubscribed(false);
        setMessage("Bildirimler bu cihazda kapatıldı.");
      } else {
        if (!publicKey) throw new Error("Bildirimler henüz yapılandırılmadı.");
        const permission = await Notification.requestPermission();
        if (permission !== "granted") throw new Error("Bildirim izni verilmedi. Tarayıcı ayarlarından izin verebilirsiniz.");
        const subscription = current ?? await registration.pushManager.subscribe({
          userVisibleOnly: true, applicationServerKey: applicationServerKey(publicKey),
        });
        try { await subscriptionRequest("POST", subscription); }
        catch (error) { if (!current) await subscription.unsubscribe(); throw error; }
        setSubscribed(true);
        setMessage("Yeni duyurular için bildirimler açıldı.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Bildirim ayarı değiştirilemedi.");
    } finally { setBusy(false); }
  }

  if (!supported || !publicKey) return null;
  return <div className="push-settings">
    <p className="learning-muted">Yeni sınıf duyurularını bu cihazda bildirim olarak alabilirsiniz.</p>
    <button type="button" className="secondary-button" disabled={busy || checking} onClick={() => void toggle()}>
      {subscribed ? "Bildirimleri kapat" : "Bildirimleri etkinleştir"}
    </button>
    {message && <p role="status" className="learning-muted">{message}</p>}
  </div>;
}
