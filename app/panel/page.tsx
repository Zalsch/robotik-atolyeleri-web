import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { requireActor } from "@/lib/server/auth";
import { hasPhaseTwoConfig } from "@/lib/server/config";
import { HttpError } from "@/lib/server/http";
import PanelHeader from "@/components/panel-header";
import { DashboardContent, DashboardSkeleton } from "@/components/dashboard";
import "./panel.css";

export default async function PanelPage() {
  await connection();
  if (!hasPhaseTwoConfig()) {
    return <main className="panel-setup"><div className="surface-card"><span className="eyebrow">FAZ 2</span><h1>Gerçek hesap bağlantısı hazırlanıyor</h1><p>Supabase sunucu anahtarı ve oturum sırrı bağlandığında bu ekranda canlı sınıf ve kullanıcı kayıtları açılacak.</p><a href="/">Tasarım önizlemesine dön</a></div></main>;
  }
  try {
    const { actor, db } = await requireActor();
    const today = new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", dateStyle: "full" }).format(new Date());
    return <div className="live-panel"><PanelHeader actor={{ id: actor.id, role: actor.role, username: actor.username, displayName: actor.display_name }} /><main className="panel-main"><div className="dashboard-welcome"><div><span className="eyebrow">DASHBOARD · {actor.role === "admin" ? "KURUM" : actor.role === "teacher" ? "ÖĞRETMEN" : "ÖĞRENCİ / VELİ"}</span><h1>Merhaba, {actor.display_name}</h1><p>{actor.role === "admin" ? "Kurumunuzun güncel durumunu bir bakışta görün." : actor.role === "teacher" ? "Sınıflarınızın güncel durumunu ve sıradaki derslerinizi görün." : "Öğrenme yolculuğunuz, dersleriniz ve sınıfınızdan haberler burada."}</p></div><span className="dashboard-date">{today}</span></div><Suspense fallback={<DashboardSkeleton />}><DashboardContent actor={actor} db={db} /></Suspense></main></div>;
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) redirect("/sign-in");
    throw error;
  }
}
