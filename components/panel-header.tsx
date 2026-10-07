"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import logo from "@/assets/brand/robotik-atolyeleri-logo.jpg";
import type { Role } from "@/lib/server/db";

export type PanelActor = { id: string; role: Role; username: string; displayName: string };

export default function PanelHeader({ actor }: { actor: PanelActor }) {
  const pathname = usePathname();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function signOut() {
    setBusy(true); setError("");
    try {
      if (actor.role === "student") {
        try {
          const { unsubscribeFromPushOnSignOut } = await import("./push-subscription-client");
          await unsubscribeFromPushOnSignOut();
        } catch { /* Logout still completes if this device cannot unsubscribe. */ }
      }
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Çıkış yapılamadı. Yeniden deneyin.");
      window.location.assign("/");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Çıkış yapılamadı."); setBusy(false); }
  }
  return <><header className="panel-header">
    <Link className="panel-brand" href="/panel" aria-label="Robotik Atölyeleri dashboard"><Image className="panel-brand-logo" src={logo} alt="" width={40} height={40} priority /><span><strong>ROBOTİK</strong><small>ATÖLYELERİ</small></span></Link>
    <nav className="panel-navigation" aria-label="Uygulama menüsü"><Link href="/panel" aria-current={pathname === "/panel" ? "page" : undefined}>Dashboard</Link><Link href="/panel/manage" aria-current={pathname === "/panel/manage" ? "page" : undefined}>{actor.role === "admin" ? "Yönetim" : "Sınıflarım"}</Link>{actor.role === "teacher" && <Link href="/panel/curricula" aria-current={pathname === "/panel/curricula" ? "page" : undefined}>Müfredatlar</Link>}<Link prefetch={false} href="/panel/aquarium" aria-current={pathname.includes("/aquarium") ? "page" : undefined}>Akvaryum</Link></nav>
    <div className="panel-account"><span>{actor.displayName}<small>{actor.role === "admin" ? "Yönetici" : actor.role === "teacher" ? "Öğretmen" : "Öğrenci / veli"}</small></span><button type="button" className="panel-signout" disabled={busy} onClick={() => void signOut()}><LogOut size={16} />{busy ? "Çıkılıyor…" : "Çıkış"}</button></div>
  </header>{error && <div className="panel-main panel-header-error"><div className="panel-alert error" role="alert">{error}</div></div>}</>;
}
