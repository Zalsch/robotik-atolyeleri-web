import Link from "next/link";
import { ArrowRight, BookOpen, CalendarDays, Check, ClipboardCheck, GraduationCap, Megaphone, Users } from "lucide-react";
import type { AppUser, Db } from "@/lib/server/db";
import { loadDashboard, type DashboardData } from "@/lib/server/dashboard";

const weekdays = ["", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];
function date(value: string) { return new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
function percentage(present: number, total: number) { return total ? `%${Math.round(present / total * 100)}` : "—"; }

export function DashboardSkeleton() {
  return <div className="dashboard-loading" role="status" aria-label="İstatistikler yükleniyor"><div className="dashboard-stats">{[0, 1, 2, 3].map((i) => <div className="dashboard-stat skeleton" key={i}><div /><div /></div>)}</div><div className="dashboard-grid"><div className="dashboard-card skeleton"><div /><div /><div /></div><div className="dashboard-card skeleton"><div /><div /><div /></div></div><span className="dashboard-loading-label">İstatistikler yükleniyor…</span></div>;
}

export async function DashboardContent({ actor, db }: { actor: AppUser; db: Db }) {
  try { return <DashboardView role={actor.role} data={await loadDashboard(db, actor)} />; }
  catch (error) {
    console.error("Dashboard could not load", error instanceof Error ? error.message : "unknown error");
    return <div className="dashboard-card"><h2>İstatistikler şu anda yüklenemedi.</h2><p>Sayfayı yenileyerek tekrar deneyebilirsiniz. Sınıflarınıza aşağıdaki bağlantıdan ulaşabilirsiniz.</p><Link className="dashboard-text-link" href="/panel/manage">{actor.role === "admin" ? "Yönetimi aç" : "Sınıflarımı aç"} <ArrowRight size={16} /></Link></div>;
  }
}

export function DashboardView({ role, data }: { role: AppUser["role"]; data: DashboardData }) {
  const student = role === "student";
  const stats = student ? [
    { label: "Devam oranım", value: percentage(data.summary.present_lessons, data.summary.completed_lessons), detail: `${data.summary.present_lessons} / ${data.summary.completed_lessons} tamamlanmış ders`, icon: ClipboardCheck, color: "mint" },
    { label: "Tamamladığım konular", value: `${data.summary.completed_topics} / ${data.summary.total_topics}`, detail: "Kayıtlı sınıflarımdaki konu ilerlemesi", icon: BookOpen, color: "blue" },
    { label: "Getirdiğim ödevler", value: `${data.broughtAssignments} / ${data.assignmentCount}`, detail: "Öğretmenin işaretlediği fiziksel teslimler", icon: Check, color: "violet" },
    { label: "Kayıtlı sınıflarım", value: data.classes.length, detail: "Etkin sınıf kayıtları", icon: GraduationCap, color: "orange" },
  ] : [
    { label: role === "admin" ? "Etkin sınıflar" : "Sınıflarım", value: data.classes.length, detail: role === "admin" ? "Kurumdaki açık sınıflar" : "Atandığım etkin sınıflar", icon: BookOpen, color: "blue" },
    { label: "Öğrenciler", value: data.students, detail: role === "admin" ? "Etkin öğrenci hesapları" : "Sınıflarımdaki farklı etkin öğrenciler", icon: GraduationCap, color: "mint" },
    { label: role === "admin" ? "Öğretmenler" : "Ödevler", value: role === "admin" ? data.teachers : data.assignmentCount, detail: role === "admin" ? "Etkin öğretmen hesapları" : "Sınıflarıma verilen etkin ödevler", icon: Users, color: "violet" },
    { label: "Tamamlanan dersler", value: data.completedLessons, detail: "Yoklaması tamamlanmış dersler", icon: ClipboardCheck, color: "orange" },
  ];
  const nameOf = (id: string) => data.classes.find((row) => row.id === id)?.name ?? "Sınıf";
  return <>
    <section className="dashboard-stats" aria-label="İstatistikler">{stats.map(({ label, value, detail, icon: Icon, color }) => <article className="dashboard-stat" key={label}><span className={`stat-icon ${color}`}><Icon size={22} aria-hidden="true" /></span><span className="dashboard-stat-label">{label}</span><strong>{value}</strong><small>{detail}</small></article>)}</section>
    <div className="dashboard-grid"><section className="dashboard-card"><div className="dashboard-card-heading"><h2><CalendarDays size={20} /> Yaklaşan dersler</h2><span>Türkiye saati</span></div>{data.upcoming.length ? data.upcoming.map((lesson) => <Link className="dashboard-row" key={lesson.id} href={role === "admin" ? "/panel/manage" : `/panel/classes/${lesson.class_id}`}><span className="dashboard-row-icon"><CalendarDays size={19} /></span><span><strong>{nameOf(lesson.class_id)}</strong><small>{date(lesson.actual_at ?? lesson.scheduled_at)} · {lesson.duration_minutes} dakika</small></span><ArrowRight size={17} /></Link>) : <p className="dashboard-empty">Henüz planlanmış bir ders yok.</p>}</section>
    <section className="dashboard-card"><div className="dashboard-card-heading"><h2><BookOpen size={20} /> {role === "admin" ? "Sınıf özeti" : "Sınıflarım"}</h2><Link className="dashboard-text-link" href="/panel/manage">Tümünü gör <ArrowRight size={15} /></Link></div>{data.classes.length ? data.classes.map((schoolClass) => <div className="dashboard-class" key={schoolClass.id}><Link className="dashboard-row" href={role === "admin" ? "/panel/manage" : `/panel/classes/${schoolClass.id}`}><span><strong>{schoolClass.name}</strong><small>{schoolClass.weekday ? `${weekdays[schoolClass.weekday]} · ${schoolClass.start_time?.slice(0, 5)}` : "Ders programı henüz girilmedi"}{!student && ` · ${schoolClass.studentCount} öğrenci`}</small></span><ArrowRight size={17} /></Link>{schoolClass.summary && <div className="dashboard-progress"><div><span>Konu ilerlemesi</span><strong>{schoolClass.summary.completed_topics} / {schoolClass.summary.total_topics}</strong></div><progress value={schoolClass.summary.completed_topics} max={schoolClass.summary.total_topics || 1} aria-label={`${schoolClass.name} konu ilerlemesi`} /><small>Devam: {percentage(schoolClass.summary.present_lessons, schoolClass.summary.completed_lessons)}</small></div>}</div>) : <p className="dashboard-empty">{role === "admin" ? "Yönetim sayfasından ilk sınıfınızı oluşturabilirsiniz." : "Henüz bir sınıfa atanmadınız. Öğretmeniniz veya yöneticiniz sınıf kaydınızı oluşturduğunda burada görünür."}</p>}</section></div>
    {role !== "admin" && <div className="dashboard-grid"><section className="dashboard-card"><div className="dashboard-card-heading"><h2><Megaphone size={20} /> Son duyurular</h2></div>{data.announcements.length ? data.announcements.map((announcement) => <article className="dashboard-announcement" key={announcement.id}><span>{nameOf(announcement.class_id)} · {date(announcement.created_at)}</span><Link href={`/panel/classes/${announcement.class_id}?tab=content#class-content`}><h3>{announcement.title}</h3></Link><p>{announcement.body}</p></article>) : <p className="dashboard-empty">Henüz bir sınıf duyurusu yok.</p>}</section>
    <section className="dashboard-card"><div className="dashboard-card-heading"><h2><ClipboardCheck size={20} /> {student ? "Ödev takibim" : "Hızlı erişim"}</h2></div>{student ? data.pendingAssignments.length ? data.pendingAssignments.slice(0, 5).map((assignment) => <Link className="dashboard-row" key={assignment.id} href={`/panel/classes/${assignment.class_id}?tab=content#class-content`}><span><strong>{assignment.title}</strong><small>{nameOf(assignment.class_id)} · Son tarih: {date(assignment.due_at)}</small></span><span className="dashboard-tag">{Date.parse(assignment.due_at) < Date.now() ? "Teslimi kontrol et" : "Hazırlanacak"}</span></Link>) : <p className="dashboard-empty">Takip edilecek ödev yok. Yeni ödevler burada görünür.</p> : <><Link className="dashboard-row" href="/panel/manage"><span><strong>Öğrenciler ve sınıflar</strong><small>Hesaplar, sınıf kayıtları ve şifre işlemleri</small></span><ArrowRight size={17} /></Link><Link className="dashboard-row" href="/panel/curricula"><span><strong>Ortak müfredatlar</strong><small>Konuları ve ders materyallerini düzenleyin</small></span><ArrowRight size={17} /></Link><p className="dashboard-empty">Yoklama, ödev ve duyuru işlemleri için ilgili sınıfı açın.</p></>}</section></div>}
  </>;
}
