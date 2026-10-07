import { redirect } from "next/navigation";
import { connection } from "next/server";
import { requireActor } from "@/lib/server/auth";
import { hasPhaseTwoConfig } from "@/lib/server/config";
import { HttpError } from "@/lib/server/http";
import PanelClient from "@/components/panel-client";
import "../panel.css";

export default async function ManagementPage() {
  await connection();
  if (!hasPhaseTwoConfig()) {
    return <main className="panel-setup"><div className="surface-card"><span className="eyebrow">FAZ 2</span><h1>Gerçek hesap bağlantısı hazırlanıyor</h1><p>Supabase sunucu anahtarı ve oturum sırrı bağlandığında bu ekranda canlı sınıf ve kullanıcı kayıtları açılacak.</p><a href="/">Tasarım önizlemesine dön</a></div></main>;
  }
  try {
    const { actor } = await requireActor();
    return <PanelClient actor={{ id: actor.id, role: actor.role, username: actor.username, displayName: actor.display_name }} />;
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) redirect("/sign-in");
    throw error;
  }
}
