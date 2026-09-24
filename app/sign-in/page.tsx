import { connection } from "next/server";
import Image from "next/image";
import Link from "next/link";
import { hasPhaseTwoConfig } from "@/lib/server/config";
import SignInForm from "@/components/sign-in-form";
import logo from "@/assets/brand/robotik-atolyeleri-logo.jpg";
import "@/app/panel/panel.css";

export default async function SignInPage() {
  await connection();
  return <main className="auth-page"><div className="auth-card"><div className="auth-card-top"><Link className="auth-brand" href="/" aria-label="Robotik Atölyeleri ana sayfa"><Image src={logo} alt="" width={44} height={44} priority /><span><strong>ROBOTİK</strong><small>ATÖLYELERİ</small></span></Link><Link className="auth-home-link" href="/">← Ana sayfa</Link></div><h1>Hesabınıza giriş yapın</h1><p>Kuruma ait kullanıcı adı ve şifrenizi kullanın.</p>{hasPhaseTwoConfig() ? <SignInForm /> : <div className="auth-notice">Hesap bağlantısı henüz yapılandırılmadı. Önizleme ana sayfada kullanılabilir.</div>}</div></main>;
}
