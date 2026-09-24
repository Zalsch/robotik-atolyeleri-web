"use client";

import { useEffect, useState } from "react";

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type Platform = "android" | "ios" | null;
const DISMISS_KEY = "pwa-install-tip-dismissed-at";
const DISMISS_DURATION = 7 * 24 * 60 * 60 * 1000;

export default function PwaInstallPrompt() {
  const [platform, setPlatform] = useState<Platform>(null);
  const [installed, setInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);

  useEffect(() => {
    const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
    const displayMode = window.matchMedia("(display-mode: standalone)");
    const updateInstalled = () => setInstalled(displayMode.matches || navigatorWithStandalone.standalone === true);
    updateInstalled();
    const isIos = /iPad|iPhone|iPod/i.test(navigator.userAgent)
      || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    setPlatform(isIos ? "ios" : /Android/i.test(navigator.userAgent) ? "android" : null);
    try {
      const dismissedAt = Number(window.localStorage.getItem(DISMISS_KEY));
      setDismissed(dismissedAt > 0 && Date.now() - dismissedAt < DISMISS_DURATION);
    } catch {
      // The installation guide still works when browser storage is disabled.
    }
    const onPrompt = (event: Event) => { event.preventDefault(); setInstallEvent(event as InstallEvent); };
    const onInstalled = () => { setInstalled(true); setInstallEvent(null); };
    displayMode.addEventListener("change", updateInstalled);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      displayMode.removeEventListener("change", updateInstalled);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!platform || installed || dismissed) return null;

  function dismiss() {
    setDismissed(true);
    try { window.localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* Storage may be unavailable. */ }
  }

  async function install() {
    if (!installEvent) return;
    try {
      await installEvent.prompt();
      await installEvent.userChoice;
    } finally {
      setInstallEvent(null);
    }
  }

  return <aside className="pwa-install-tip" aria-label="Uygulamayı ana ekrana ekle">
    <button type="button" className="pwa-install-dismiss" aria-label="Kurulum yönergesini kapat" onClick={dismiss}>×</button>
    <strong>Robotik Atölyeleri’ni ana ekrana ekleyin</strong>
    {platform === "ios" ? <p>iPhone’da bağlantıyı Safari’de açın. Sayfa menüsünden <b>Paylaş</b> → <b>Ana Ekrana Ekle</b> yolunu izleyin. Seçenek görünmüyorsa <b>Eylemleri Düzenle</b> bölümünden ekleyin.</p>
      : <p>Android’de Chrome menüsündeki <b>⋮ → Uygulamayı yükle</b> veya <b>Ana ekrana ekle</b> seçeneğini kullanın. Telefon güvenlik uyarısı verirse kurulumu zorlamadan siteyi tarayıcıdan kullanın.</p>}
    {platform === "android" && installEvent && <button type="button" className="pwa-install-action" onClick={() => void install().catch(() => setInstallEvent(null))}>Ana ekrana ekle</button>}
  </aside>;
}
