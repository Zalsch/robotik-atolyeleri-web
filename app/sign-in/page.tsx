import { connection } from "next/server";
import { hasPhaseTwoConfig } from "@/lib/server/config";
import SignInForm from "@/components/sign-in-form";
import "@/app/panel/panel.css";

export default async function SignInPage() {
  await connection();
  return <main className="auth-page"><div className="auth-card"><span className="eyebrow">ROBOTİK ATÖLYELERİ</span><h1>Hesabınıza giriş yapın</h1><p>Kuruma ait kullanıcı adı ve şifrenizi kullanın.</p>{hasPhaseTwoConfig() ? <SignInForm /> : <div className="auth-notice">Hesap bağlantısı henüz yapılandırılmadı. Önizleme ana sayfada kullanılabilir.</div>}</div></main>;
}
