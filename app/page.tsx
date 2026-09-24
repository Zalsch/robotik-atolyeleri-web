import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BookOpen, CalendarDays, ClipboardCheck, Megaphone } from "lucide-react";
import logo from "@/assets/brand/robotik-atolyeleri-logo.jpg";
import "./home.css";

const features = [
  { icon: BookOpen, title: "Adım adım öğrenme", description: "İşlenen konular ve kazanımlar tek yerde düzenli biçimde görünür." },
  { icon: ClipboardCheck, title: "Ders takibi", description: "Ders programı, yoklama ve ödev durumu kolayca takip edilir." },
  { icon: Megaphone, title: "Sınıftan haberler", description: "Öğretmenin paylaştığı duyurular öğrenci ve veliye ulaşır." },
];

export default function Home() {
  return <div className="home-page">
    <header className="home-header"><div className="home-container home-nav">
      <Link className="home-brand" href="/" aria-label="Robotik Atölyeleri ana sayfa"><Image src={logo} alt="" width={54} height={54} priority /><span><strong>ROBOTİK</strong><small>ATÖLYELERİ</small></span></Link>
      <Link className="home-login" href="/sign-in">Giriş yap <ArrowRight size={17} aria-hidden="true" /></Link>
    </div></header>
    <main>
      <section className="home-hero"><div className="home-container home-hero-grid">
        <div className="home-hero-copy"><span className="home-kicker"><span /> ROBOTİK KODLAMA ATÖLYESİ</span>
          <h1>Merakla başlar.<br /><em>Üreterek büyür.</em></h1>
          <p>Robotik Atölyeleri’nde dersler, kazanımlar ve gelişim yolculuğu aynı yerde buluşur. Öğrenciler öğrenir, öğretmenler yol gösterir, aileler süreci takip eder.</p>
          <div className="home-hero-actions"><Link className="home-primary" href="/sign-in">Hesabıma giriş yap <ArrowRight size={18} aria-hidden="true" /></Link><span>Hesap bilgilerinizi öğretmeninizden alın.</span></div>
        </div>
        <div className="home-hero-art" aria-hidden="true"><div className="home-orbit home-orbit-outer" /><div className="home-orbit home-orbit-inner" /><div className="home-art-core"><Image src={logo} alt="" width={220} height={220} priority /></div><span className="home-art-chip chip-one"><BookOpen size={20} /> Öğren</span><span className="home-art-chip chip-two"><CalendarDays size={20} /> Keşfet</span><span className="home-art-dot dot-one" /><span className="home-art-dot dot-two" /></div>
      </div></section>
      <section className="home-features home-container" aria-labelledby="home-features-title"><div className="home-section-heading"><span>ATÖLYE DENEYİMİ</span><h2 id="home-features-title">Öğrenme yolculuğu, tek bir yerde.</h2><p>Öğretmenler için pratik takip, öğrenciler ve veliler için anlaşılır bir görünüm.</p></div><div className="home-feature-grid">{features.map(({ icon: Icon, title, description }, index) => <article className="home-feature" key={title}><div className={`home-feature-icon feature-${index}`}><Icon size={25} strokeWidth={1.8} aria-hidden="true" /></div><h3>{title}</h3><p>{description}</p></article>)}</div></section>
      <section className="home-access"><div className="home-container home-access-inner"><div><span>HEMEN BAŞLAYIN</span><h2>Atölyedeki gelişimi birlikte izleyin.</h2><p>Giriş bilgilerinizi aldıysanız öğrenci, veli veya öğretmen hesabınızla devam edin.</p></div><Link className="home-access-link" href="/sign-in">Giriş yap <ArrowRight size={18} aria-hidden="true" /></Link></div></section>
    </main>
    <footer className="home-footer"><div className="home-container"><span>© Robotik Atölyeleri</span><span>Merak et · Tasarla · Üret</span></div></footer>
  </div>;
}
