"use client";

import { useState } from "react";
import Image from "next/image";
import {
  ArrowRight, Bell, BookOpen, CalendarDays, Check, ChevronDown, ChevronRight,
  CircleHelp, ClipboardCheck, Clock3, GraduationCap, House, LayoutGrid,
  Megaphone, MoreHorizontal, Plus, Search, Settings2, Users, X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import logo from "@/assets/brand/robotik-atolyeleri-logo.jpg";
import { TeacherCurricula, TeacherStudents } from "@/components/teacher-management";

type Role = "teacher" | "student" | "admin";
type NavItem = { label: string; icon: LucideIcon };

const navigation: Record<Role, NavItem[]> = {
  teacher: [
    { label: "Ana sayfa", icon: House },
    { label: "Sınıflarım", icon: LayoutGrid },
    { label: "Müfredat", icon: BookOpen },
    { label: "Duyurular", icon: Megaphone },
  ],
  student: [
    { label: "Ana sayfa", icon: House },
    { label: "İlerleme", icon: GraduationCap },
    { label: "Ödevler", icon: ClipboardCheck },
    { label: "Duyurular", icon: Megaphone },
  ],
  admin: [
    { label: "Ana sayfa", icon: House },
    { label: "Sınıflar", icon: LayoutGrid },
    { label: "Öğretmenler", icon: Users },
  ],
};

const roleNames: Record<Role, string> = {
  teacher: "Öğretmen",
  student: "Öğrenci / veli",
  admin: "Yönetici",
};

const students = [
  { name: "Ada Yılmaz", initials: "AY", color: "violet" },
  { name: "Can Demir", initials: "CD", color: "blue" },
  { name: "Elif Kaya", initials: "EK", color: "peach" },
  { name: "Mert Arslan", initials: "MA", color: "mint" },
];

function IconButton({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick?: () => void }) {
  return <button className="icon-button" type="button" aria-label={label} onClick={onClick}><Icon size={19} strokeWidth={2} /></button>;
}

function SectionHeading({ eyebrow, title, action, onAction }: { eyebrow?: string; title: string; action?: string; onAction?: () => void }) {
  return <div className="section-heading"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2>{title}</h2></div>{action && <button className="text-link" type="button" onClick={onAction}>{action}<ArrowRight size={16} /></button>}</div>;
}

function ProgressBar({ value }: { value: number }) {
  return <div className="progress-track" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${value}%` }} /></div>;
}

function TeacherHome({ navigate }: { navigate: (page: string) => void }) {
  return <>
    <div className="welcome-row"><div><span className="eyebrow">19 EYLÜL 2026 · CUMARTESİ</span><h1>Günaydın, Zeynep 👋</h1><p>Bugün öğrencilerinle güzel şeyler üreteceksin.</p></div><button className="primary-button desktop-only" type="button" onClick={() => navigate("Sınıflarım")}><Plus size={18} /> Sınıflarıma git</button></div>
    <div className="teacher-hero"><div className="hero-copy"><span className="hero-pill"><span className="pulse-dot" /> SIRADAKİ DERS</span><h2>Robotik 101 · A Sınıfı</h2><p>Bugün, 14.00 – 15.30</p><div className="hero-meta"><span><Users size={16} /> 10 öğrenci</span><span><BookOpen size={16} /> Sensörlerle tanışma</span></div><button className="hero-button" type="button" onClick={() => navigate("Sınıflarım")}>Ders ekranına git <ArrowRight size={17} /></button></div><div className="hero-art" aria-hidden="true"><div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" /><div className="art-core"><span>R</span><div className="art-eyes"><i /><i /></div><div className="art-smile" /></div><div className="art-spark spark-one">✦</div><div className="art-spark spark-two">+</div></div></div>
    <div className="stats-grid"><div className="stat-card"><div className="stat-icon blue"><LayoutGrid size={20} /></div><div><strong>3</strong><span>Aktif sınıfım</span></div></div><div className="stat-card"><div className="stat-icon violet"><Users size={20} /></div><div><strong>28</strong><span>Toplam öğrenci</span></div></div><div className="stat-card"><div className="stat-icon orange"><ClipboardCheck size={20} /></div><div><strong>2</strong><span>Bekleyen yoklama</span></div></div></div>
    <div className="content-grid"><section className="surface-card"><SectionHeading eyebrow="BU HAFTA" title="Ders programım" action="Sınıfları gör" onAction={() => navigate("Sınıflarım")} /><div className="schedule-list"><div className="schedule-item"><div className="date-tile"><strong>19</strong><span>CMT</span></div><div className="schedule-text"><strong>Robotik 101 · A Sınıfı</strong><span>Sensörlerle tanışma</span></div><span className="schedule-time">14.00</span></div><div className="schedule-item"><div className="date-tile muted"><strong>21</strong><span>PZT</span></div><div className="schedule-text"><strong>Robotik 102 · B Sınıfı</strong><span>Motorlar ve hareket</span></div><span className="schedule-time">16.30</span></div><div className="schedule-item"><div className="date-tile muted"><strong>23</strong><span>ÇAR</span></div><div className="schedule-text"><strong>Robotik 101 · C Sınıfı</strong><span>Devre kurma</span></div><span className="schedule-time">15.00</span></div></div></section><section className="surface-card"><SectionHeading eyebrow="HIZLI ERİŞİM" title="Bugün yapılacaklar" /><div className="task-list"><button type="button" onClick={() => navigate("Sınıflarım")}><span className="task-icon orange"><ClipboardCheck size={19} /></span><span><strong>Yoklamayı tamamla</strong><small>Robotik 101 · A Sınıfı</small></span><ChevronRight size={18} /></button><button type="button" onClick={() => navigate("Müfredat")}><span className="task-icon violet"><BookOpen size={19} /></span><span><strong>Konuları gözden geçir</strong><small>Ortak müfredat</small></span><ChevronRight size={18} /></button><button type="button" onClick={() => navigate("Duyurular")}><span className="task-icon blue"><Megaphone size={19} /></span><span><strong>Duyuru paylaş</strong><small>Sınıfını bilgilendir</small></span><ChevronRight size={18} /></button></div></section></div>
  </>;
}

function TeacherClasses() {
  const [attendance, setAttendance] = useState<Record<string, boolean>>({ "Ada Yılmaz": true, "Can Demir": true, "Elif Kaya": true });
  return <><div className="welcome-row"><div><span className="eyebrow">SINIF YÖNETİMİ</span><h1>Sınıflarım</h1><p>Atandığın sınıfları ve ders işlemlerini buradan yönet.</p></div></div><div className="class-overview"><div className="class-badge"><LayoutGrid size={22} /></div><div><span className="eyebrow">AKTİF SINIF</span><h2>Robotik 101 · A Sınıfı</h2><p>Cumartesi · 14.00–15.30 · 10 öğrenci</p></div><span className="status-pill">Bugün ders var</span></div><TeacherStudents /><section className="surface-card attendance-card"><div className="section-heading"><div><span className="eyebrow">19 EYLÜL 2026</span><h2>Bugünkü yoklama</h2></div><span className="demo-note">Örnek etkileşim</span></div><p className="helper-text">Her öğrenci için var veya yok seç. Bu önizlemedeki seçimler kaydedilmez.</p><div className="attendance-list">{students.map((student) => <div className="attendance-row" key={student.name}><div className={`avatar ${student.color}`}>{student.initials}</div><strong>{student.name}</strong><div className="attendance-actions"><button type="button" className={attendance[student.name] === true ? "selected present" : ""} onClick={() => setAttendance({ ...attendance, [student.name]: true })}><Check size={15} /> Var</button><button type="button" className={attendance[student.name] === false ? "selected absent" : ""} onClick={() => setAttendance({ ...attendance, [student.name]: false })}><X size={15} /> Yok</button></div></div>)}</div></section><div className="small-card-grid"><div className="surface-card compact-card"><BookOpen className="card-icon" size={22} /><h3>Müfredat</h3><p>Bu sınıf için 12 konu başlığı bulunuyor.</p></div><div className="surface-card compact-card"><ClipboardCheck className="card-icon" size={22} /><h3>Ödevler</h3><p>Bu hafta 1 fiziksel ödev takip ediliyor.</p></div></div></>;
}

function Announcements({ role }: { role: Role }) {
  return <><div className="welcome-row"><div><span className="eyebrow">HABERLER</span><h1>Duyurular</h1><p>{role === "teacher" ? "Sınıflarını gelişmelerden haberdar et." : "Sınıfından gelen son haberler burada."}</p></div>{role === "teacher" && <button className="primary-button desktop-only" type="button" disabled title="Duyuru oluşturma Faz 4'te eklenecek"><Plus size={18} /> Duyuru oluştur</button>}</div><div className="announcement-stack"><article className="surface-card announcement-card"><span className="announcement-icon"><Megaphone size={22} /></span><div><span className="eyebrow">ROBOTİK 101 · A SINIFI · 18 EYLÜL</span><h2>Yarınki derste sensörleri keşfediyoruz!</h2><p>Bir sonraki ders için çalışma kâğıdınızı yanınızda getirmeyi unutmayın. Görüşmek üzere!</p></div></article><article className="surface-card announcement-card"><span className="announcement-icon pale"><CalendarDays size={22} /></span><div><span className="eyebrow">ROBOTİK 101 · A SINIFI · 12 EYLÜL</span><h2>Yeni döneme hoş geldiniz</h2><p>Bu dönem birlikte pek çok proje üreteceğiz. İlk dersimizde görüşürüz!</p></div></article></div></>;
}

function StudentHome({ navigate }: { navigate: (page: string) => void }) {
  return <><div className="welcome-row"><div><span className="eyebrow">ROBOTİK 101 · A SINIFI</span><h1>Merhaba, Ada 👋</h1><p>Bugün neler öğrendiğine birlikte bakalım.</p></div></div><div className="student-hero"><div><span className="hero-pill light"><span className="pulse-dot" /> ÖĞRENME YOLCULUĞUN</span><h2>Her yeni konu, yeni bir keşif.</h2><p>12 konunun 7&apos;sini tamamladın. Harika gidiyorsun!</p><button type="button" onClick={() => navigate("İlerleme")}>İlerlememi gör <ArrowRight size={17} /></button></div><div className="student-hero-bubbles" aria-hidden="true"><span>✦</span><span>58%</span><span>✧</span></div></div><div className="stats-grid student-stats"><div className="stat-card"><div className="stat-icon blue"><BookOpen size={20} /></div><div><strong>7 / 12</strong><span>Tamamlanan konu</span></div></div><div className="stat-card"><div className="stat-icon mint"><Check size={20} /></div><div><strong>%90</strong><span>Devam oranı</span></div></div><div className="stat-card"><div className="stat-icon orange"><ClipboardCheck size={20} /></div><div><strong>1</strong><span>Bekleyen ödev</span></div></div></div><div className="content-grid"><section className="surface-card"><SectionHeading eyebrow="YAKLAŞAN DERS" title="Sıradaki buluşmamız" /><div className="next-class"><div className="date-tile"><strong>26</strong><span>CMT</span></div><div><strong>Robotik 101 · A Sınıfı</strong><p>14.00 – 15.30 · Sensörlerle tanışma</p></div></div><div className="notice-strip"><Clock3 size={17} /> Ders saatinde bir değişiklik olursa burada görünür.</div></section><section className="surface-card"><SectionHeading eyebrow="ÖDEVLER" title="Yapılacaklar" action="Tüm ödevler" onAction={() => navigate("Ödevler")} /><div className="homework-preview"><span className="homework-icon"><ClipboardCheck size={23} /></span><div><strong>Çizgi izleyen robot</strong><p>Son tarih: 26 Eylül · Fiziksel teslim</p></div><ChevronRight size={18} /></div><div className="due-tag">Teslim bekleniyor</div></section></div></>;
}

function StudentProgress() {
  return <><div className="welcome-row"><div><span className="eyebrow">ÖĞRENME YOLCULUĞU</span><h1>İlerlemem</h1><p>Konuları ve derslere katılımını takip et.</p></div></div><div className="content-grid"><section className="surface-card"><SectionHeading title="Konu ilerlemesi" /><div className="large-progress"><strong>%58</strong><span>7 / 12 konu tamamlandı</span><ProgressBar value={58} /></div><div className="topic-list compact">{["Robotik dünyasına giriş", "Temel devre elemanları", "Sensörlerle tanışma"].map((topic, i) => <div className="topic-row" key={topic}><span className="topic-number">{String(i + 1).padStart(2, "0")}</span><strong>{topic}</strong>{i < 2 && <Check size={18} className="success-icon" />}</div>)}</div></section><section className="surface-card"><SectionHeading title="Derslere katılım" /><div className="attendance-summary"><span className="stat-icon mint"><Check size={24} /></span><strong>%90</strong><p>10 tamamlanmış dersin 9&apos;una katıldın.</p></div><div className="attendance-history"><div><span>12 Eylül</span><strong className="positive">Var</strong></div><div><span>5 Eylül</span><strong className="positive">Var</strong></div><div><span>29 Ağustos</span><strong className="negative">Yok</strong></div></div></section></div></>;
}

function StudentHomework() {
  return <><div className="welcome-row"><div><span className="eyebrow">GÖREVLERİM</span><h1>Ödevlerim</h1><p>Ödev kâğıdını aç, hazırla ve derse getir.</p></div></div><div className="homework-list"><article className="surface-card homework-card"><span className="homework-icon"><ClipboardCheck size={24} /></span><div><span className="eyebrow">SON TARİH · 26 EYLÜL</span><h2>Çizgi izleyen robot</h2><p>Çalışma kâğıdındaki devreyi kurup derse getir.</p><span className="link-placeholder">PDF bağlantısı Faz 4&apos;te eklenecek</span></div><span className="due-tag">Teslim bekleniyor</span></article><article className="surface-card homework-card"><span className="homework-icon done"><Check size={24} /></span><div><span className="eyebrow">SON TARİH · 12 EYLÜL</span><h2>İlk devrem</h2><p>Basit bir LED devresi kur ve derste göster.</p></div><span className="done-tag">Getirdi</span></article></div></>;
}

function AdminHome({ navigate }: { navigate: (page: string) => void }) {
  return <><div className="welcome-row"><div><span className="eyebrow">KURUM YÖNETİMİ</span><h1>Merhaba, Yönetici 👋</h1><p>Sınıfların ve öğretmenlerin genel görünümü.</p></div></div><div className="stats-grid"><div className="stat-card"><div className="stat-icon blue"><LayoutGrid size={20} /></div><div><strong>12</strong><span>Aktif sınıf</span></div></div><div className="stat-card"><div className="stat-icon violet"><Users size={20} /></div><div><strong>6</strong><span>Öğretmen</span></div></div><div className="stat-card"><div className="stat-icon orange"><GraduationCap size={20} /></div><div><strong>120</strong><span>Öğrenci</span></div></div></div><section className="surface-card"><SectionHeading eyebrow="GENEL BAKIŞ" title="Sınıflar" action="Tüm sınıflar" onAction={() => navigate("Sınıflar")} /><div className="admin-class-list"><div><span className="admin-class-icon blue"><LayoutGrid size={20} /></span><span><strong>Robotik 101 · A Sınıfı</strong><small>Zeynep Yıldız, Emre Koç · 10 öğrenci</small></span><ChevronRight size={18} /></div><div><span className="admin-class-icon violet"><LayoutGrid size={20} /></span><span><strong>Robotik 102 · B Sınıfı</strong><small>Zeynep Yıldız · 11 öğrenci</small></span><ChevronRight size={18} /></div><div><span className="admin-class-icon mint"><LayoutGrid size={20} /></span><span><strong>Robotik 101 · C Sınıfı</strong><small>Emre Koç · 9 öğrenci</small></span><ChevronRight size={18} /></div></div></section></>;
}

function AdminList({ page }: { page: string }) {
  const isClass = page === "Sınıflar";
  return <><div className="welcome-row"><div><span className="eyebrow">KURUM YÖNETİMİ</span><h1>{page}</h1><p>{isClass ? "Sınıfları ve öğretmen atamalarını görüntüle." : "Öğretmen hesaplarını ve atandıkları sınıfları görüntüle."}</p></div><button className="primary-button desktop-only" type="button" disabled title="Hesap oluşturma Faz 2'de eklenecek"><Plus size={18} /> {isClass ? "Sınıf oluştur" : "Öğretmen ekle"}</button></div><section className="surface-card"><SectionHeading title={isClass ? "Tüm sınıflar" : "Öğretmenler"} /><div className="admin-class-list">{(isClass ? [{ title: "Robotik 101 · A Sınıfı", desc: "Zeynep Yıldız, Emre Koç · 10 öğrenci" }, { title: "Robotik 102 · B Sınıfı", desc: "Zeynep Yıldız · 11 öğrenci" }, { title: "Robotik 101 · C Sınıfı", desc: "Emre Koç · 9 öğrenci" }] : [{ title: "Zeynep Yıldız", desc: "Robotik 101 · A, Robotik 102 · B" }, { title: "Emre Koç", desc: "Robotik 101 · A, Robotik 101 · C" }, { title: "Ayşe Çelik", desc: "Robotik 103 · D" }]).map((item, index) => <div key={item.title}><span className={`admin-class-icon ${["blue", "violet", "mint"][index]}`}>{isClass ? <LayoutGrid size={20} /> : <Users size={20} />}</span><span><strong>{item.title}</strong><small>{item.desc}</small></span><ChevronRight size={18} /></div>)}</div></section></>;
}

export default function PreviewApp() {
  const [role, setRole] = useState<Role>("teacher");
  const [page, setPage] = useState("Ana sayfa");
  const [showRoleMenu, setShowRoleMenu] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const changeRole = (nextRole: Role) => { setRole(nextRole); setPage("Ana sayfa"); setShowRoleMenu(false); };
  const showPage = (nextPage: string) => { setPage(nextPage); window.scrollTo({ top: 0, behavior: "smooth" }); };
  let content;
  if (role === "teacher") content = page === "Ana sayfa" ? <TeacherHome navigate={showPage} /> : page === "Sınıflarım" ? <TeacherClasses /> : page === "Müfredat" ? <TeacherCurricula /> : <Announcements role={role} />;
  else if (role === "student") content = page === "Ana sayfa" ? <StudentHome navigate={showPage} /> : page === "İlerleme" ? <StudentProgress /> : page === "Ödevler" ? <StudentHomework /> : <Announcements role={role} />;
  else content = page === "Ana sayfa" ? <AdminHome navigate={showPage} /> : <AdminList page={page} />;
  return <div className="app-shell"><aside className="sidebar"><div className="brand"><Image src={logo} alt="Robotik Atölyeleri logosu" width={50} height={50} priority /><div><strong>ROBOTİK</strong><span>ATÖLYELERİ</span></div></div><div className="side-section-label">MENÜ</div><nav className="side-nav" aria-label="Ana menü">{navigation[role].map(({ label, icon: Icon }) => <button key={label} type="button" className={page === label ? "active" : ""} onClick={() => showPage(label)}><Icon size={20} strokeWidth={2} /><span>{label}</span>{page === label && <span className="nav-marker" />}</button>)}</nav><div className="sidebar-bottom"><div className="help-card"><span><CircleHelp size={20} /></span><strong>Bir şeye mi ihtiyacın var?</strong><p>Bu ekranlar tasarım önizlemesidir.</p><button type="button" onClick={() => setShowHelp(true)}>Önizleme bilgisi <ArrowRight size={15} /></button></div><button className="settings-row" type="button" onClick={() => setShowHelp(true)}><Settings2 size={19} /> Hakkında</button></div></aside><div className="main-column"><header className="topbar"><div className="mobile-brand"><Image src={logo} alt="Robotik Atölyeleri logosu" width={37} height={37} /><strong>ROBOTİK <span>ATÖLYELERİ</span></strong></div><div className="topbar-breadcrumb desktop-only"><span>Çalışma alanı</span><ChevronRight size={15} /><strong>{page}</strong></div><div className="topbar-actions"><span className="preview-badge">TASARIM ÖNİZLEMESİ</span><IconButton icon={Bell} label="Bildirim önizleme bilgisi" onClick={() => setShowHelp(true)} /><div className="role-select"><button type="button" className="role-trigger" onClick={() => setShowRoleMenu(!showRoleMenu)} aria-expanded={showRoleMenu} aria-haspopup="menu"><span className="role-avatar">{role === "teacher" ? "ZY" : role === "student" ? "AY" : "Y"}</span><span className="role-label"><strong>{role === "teacher" ? "Zeynep Yıldız" : role === "student" ? "Ada Yılmaz" : "Yönetici"}</strong><small>{roleNames[role]}</small></span><ChevronDown size={16} /></button>{showRoleMenu && <div className="role-menu" role="menu"><span className="menu-caption">EKRAN ÖNİZLEMESİ</span>{(["teacher", "student", "admin"] as Role[]).map((item) => <button type="button" role="menuitem" key={item} onClick={() => changeRole(item)} className={role === item ? "selected" : ""}>{roleNames[item]} {role === item && <Check size={15} />}</button>)}</div>}</div></div></header><main className="main-content">{content}<footer className="page-footer">Robotik Atölyeleri · Faz 1 tasarım önizlemesi · Veriler örnektir</footer></main></div><nav className="mobile-nav" aria-label="Mobil menü">{navigation[role].map(({ label, icon: Icon }) => <button key={label} type="button" className={page === label ? "active" : ""} onClick={() => showPage(label)}><Icon size={21} strokeWidth={page === label ? 2.4 : 2} /><span>{label}</span></button>)}</nav>{showHelp && <div className="dialog-backdrop" onClick={() => setShowHelp(false)}><div className="info-dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title" onClick={(event) => event.stopPropagation()}><IconButton icon={X} label="Kapat" onClick={() => setShowHelp(false)} /><span className="dialog-icon"><CircleHelp size={24} /></span><h2 id="dialog-title">Faz 1 tasarım önizlemesi</h2><p>Rol seçicisinden yönetici, öğretmen ve öğrenci/veli ekranlarına geçebilirsin. İçerikler örnek veridir; hesap açma, kayıt ve bildirim işlemleri sonraki fazlarda bağlanacak.</p><button className="primary-button" type="button" onClick={() => setShowHelp(false)}>Anladım</button></div></div>}</div>;
}
