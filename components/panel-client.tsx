"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { BookOpen, Check, GraduationCap, LayoutGrid, Plus, Users } from "lucide-react";
import type { Role } from "@/lib/server/db";
import PanelHeader from "./panel-header";
const AdminSyncStatus = dynamic(() => import("./admin-sync-status"), { loading: () => <p role="status" className="panel-empty">Aktarım durumu yükleniyor…</p> });

type Actor = { id: string; role: Role; username: string; displayName: string };
type Teacher = { id: string; username: string; display_name: string; active: boolean };
type SchoolClass = { id: string; name: string; teacherIds?: string[] };
type Student = { id: string; username: string; display_name: string; active: boolean };

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { cache: "no-store", ...init });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? "İşlem tamamlanamadı.");
  return body as T;
}

function jsonRequest(method: string, body: unknown): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

function field(form: HTMLFormElement, name: string) {
  return String(new FormData(form).get(name) ?? "").trim();
}

function passwordValue(form: HTMLFormElement) {
  return String(new FormData(form).get("password") ?? "");
}

export default function PanelClient({ actor }: { actor: Actor }) {
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [showSyncStatus, setShowSyncStatus] = useState(false);
  const [newClassTeacherIds, setNewClassTeacherIds] = useState<string[]>([]);
  const [editingClassId, setEditingClassId] = useState("");
  const [editTeacherIds, setEditTeacherIds] = useState<string[]>([]);
  const [studentMode, setStudentMode] = useState<"new" | "existing">("new");
  const [passwordTarget, setPasswordTarget] = useState<{ id: string; name: string } | null>(null);

  const refreshBase = useCallback(async () => {
    const [classesResult, teachersResult] = await Promise.all([
      api<{ classes: SchoolClass[] }>("/api/classes"),
      actor.role === "admin" ? api<{ teachers: Teacher[] }>("/api/teachers") : Promise.resolve(null),
    ]);
    setClasses(classesResult.classes);
    if (teachersResult) {
      setTeachers(teachersResult.teachers);
    }
    if (actor.role === "teacher") {
      setSelectedClassId((current) => classesResult.classes.some((item) => item.id === current)
        ? current : classesResult.classes[0]?.id ?? "");
    }
  }, [actor.role]);

  const refreshStudents = useCallback(async () => {
    if (actor.role !== "teacher" || !selectedClassId) { setStudents([]); return; }
    const result = await api<{ students: Student[] }>(`/api/classes/${selectedClassId}/students`);
    setStudents(result.students);
  }, [actor.role, selectedClassId]);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => refreshBase())
      .catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "Veriler alınamadı."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [refreshBase]);

  useEffect(() => {
    if (actor.role !== "teacher" || !selectedClassId) { setStudents([]); return; }
    let cancelled = false;
    setStudentsLoading(true);
    void api<{ students: Student[] }>(`/api/classes/${selectedClassId}/students`)
      .then((result) => { if (!cancelled) setStudents(result.students); })
      .catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "Öğrenciler alınamadı."); })
      .finally(() => { if (!cancelled) setStudentsLoading(false); });
    return () => { cancelled = true; };
  }, [actor.role, refreshStudents, selectedClassId]);

  async function run(action: () => Promise<unknown>, success: string, reload: () => Promise<void> = refreshBase) {
    setBusy(true); setError(""); setNotice("");
    try { await action(); await reload(); setNotice(success); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "İşlem tamamlanamadı."); }
    finally { setBusy(false); }
  }

  function toggleId(current: string[], id: string, setter: (ids: string[]) => void) {
    if (current.includes(id)) setter(current.filter((item) => item !== id));
    else if (current.length < 2) setter([...current, id]);
    else setError("Bir sınıfa en fazla iki öğretmen atanabilir.");
  }

  function onCreateTeacher(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = { displayName: field(form, "displayName"), username: field(form, "username"), password: passwordValue(form) };
    void run(async () => { await api("/api/teachers", jsonRequest("POST", payload)); form.reset(); }, "Öğretmen hesabı oluşturuldu. İlk şifreyi güvenli biçimde öğretmene iletin.");
  }

  function onCreateClass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    void run(async () => {
      await api("/api/classes", jsonRequest("POST", { name: field(form, "name"), teacherIds: newClassTeacherIds }));
      form.reset(); setNewClassTeacherIds([]);
    }, "Sınıf ve öğretmen atamaları oluşturuldu.");
  }

  function onAddStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = studentMode === "new"
      ? { mode: "new", displayName: field(form, "displayName"), username: field(form, "username"), password: passwordValue(form) }
      : { mode: "existing", username: field(form, "username") };
    void run(async () => {
      await api(`/api/classes/${selectedClassId}/students`, jsonRequest("POST", payload));
      form.reset();
    }, studentMode === "new" ? "Öğrenci hesabı ve sınıf kaydı oluşturuldu." : "Mevcut öğrenci sınıfa eklendi.", refreshStudents);
  }

  function onResetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!passwordTarget) return;
    const form = event.currentTarget;
    const target = passwordTarget;
    void run(async () => {
      await api(`/api/users/${target.id}/password`, jsonRequest("POST", { password: passwordValue(form) }));
      setPasswordTarget(null);
    }, `${target.name} için yeni şifre kaydedildi. Şifreyi güvenli biçimde iletin.`, async () => {});
  }

  return <div className="live-panel">
    <PanelHeader actor={actor} />
    <main className="panel-main">
      <div className="panel-heading"><span className="eyebrow">CANLI UYGULAMA</span><h1>{actor.role === "admin" ? "Kurum yönetimi" : actor.role === "teacher" ? "Sınıflarım" : "Sınıfım"}</h1><p>{actor.role === "admin" ? "Öğretmen hesaplarını ve sınıfları yönetin." : actor.role === "teacher" ? "Öğrencileri, dersleri, ödevleri ve duyuruları yönetin." : "Derslerinizi, ödevlerinizi ve duyuruları görün."}</p></div>
      {error && <div className="panel-alert error" role="alert">{error}</div>}
      {notice && <div className="panel-alert success" role="status"><Check size={16} /> {notice}</div>}
      {loading ? <div className="surface-card">Veriler yükleniyor…</div> : actor.role === "admin" ? <>
        <div className="panel-grid">
          <section className="surface-card panel-card"><div className="panel-card-title"><span className="stat-icon violet"><Users size={20} /></span><div><h2>Öğretmen oluştur</h2><p>Hesabı yalnızca yönetici açabilir.</p></div></div><form className="panel-form" onSubmit={onCreateTeacher}><label>Ad soyad<input name="displayName" required minLength={2} maxLength={120} placeholder="Örn. Zeynep Yıldız" /></label><label>Kullanıcı adı<input name="username" required pattern="[a-zA-Z0-9._-]{3,32}" placeholder="zeynep.yildiz" /></label><label>İlk şifre<input name="password" type="password" required minLength={12} autoComplete="new-password" placeholder="En az 12 karakter" /></label><button className="primary-button" disabled={busy}><Plus size={17} /> Öğretmen oluştur</button></form></section>
          <section className="surface-card panel-card"><div className="panel-card-title"><span className="stat-icon blue"><LayoutGrid size={20} /></span><div><h2>Sınıf oluştur</h2><p>En fazla iki öğretmen atayın.</p></div></div><form className="panel-form" onSubmit={onCreateClass}><label>Sınıf adı<input name="name" required minLength={2} maxLength={120} placeholder="Örn. Robotik 101 · A" /></label><fieldset className="panel-checks"><legend>Öğretmenler</legend>{teachers.filter((teacher) => teacher.active).map((teacher) => <label key={teacher.id}><input type="checkbox" checked={newClassTeacherIds.includes(teacher.id)} onChange={() => toggleId(newClassTeacherIds, teacher.id, setNewClassTeacherIds)} />{teacher.display_name}</label>)}{teachers.length === 0 && <small>Önce öğretmen oluşturun.</small>}</fieldset><button className="primary-button" disabled={busy}><Plus size={17} /> Sınıf oluştur</button></form></section>
        </div>
        <div className="panel-sync-toggle"><button type="button" className="secondary-button" aria-expanded={showSyncStatus} aria-controls="sync-status" onClick={() => setShowSyncStatus((current) => !current)}>{showSyncStatus ? "Aktarım durumunu gizle" : "Yoklama aktarım durumunu göster"}</button>{showSyncStatus && <div id="sync-status"><AdminSyncStatus /></div>}</div>
        <div className="panel-grid panel-lists"><section className="surface-card panel-card"><div className="panel-list-heading"><h2>Öğretmenler</h2><span>{teachers.length} hesap</span></div>{teachers.length === 0 ? <p className="panel-empty">Henüz öğretmen yok.</p> : teachers.map((teacher) => <div className="panel-list-row" key={teacher.id}><span className="panel-row-icon"><Users size={18} /></span><span className="panel-row-copy"><strong>{teacher.display_name}</strong><small>@{teacher.username} · {teacher.active ? "Etkin" : "Pasif"}</small></span><div className="panel-row-actions"><button type="button" disabled={busy} onClick={() => setPasswordTarget({ id: teacher.id, name: teacher.display_name })}>Şifre yenile</button><button type="button" disabled={busy} onClick={() => void run(async () => { await api(`/api/teachers/${teacher.id}`, jsonRequest("PATCH", { active: !teacher.active })); }, teacher.active ? "Öğretmen pasifleştirildi." : "Öğretmen etkinleştirildi.")}>{teacher.active ? "Pasifleştir" : "Etkinleştir"}</button></div></div>)}</section>
        <section className="surface-card panel-card"><div className="panel-list-heading"><h2>Sınıflar</h2><span>{classes.length} sınıf</span></div>{classes.length === 0 ? <p className="panel-empty">Henüz sınıf yok.</p> : classes.map((schoolClass) => <div className="panel-class-row" key={schoolClass.id}><div className="panel-list-row"><span className="panel-row-icon"><BookOpen size={18} /></span><span className="panel-row-copy"><strong>{schoolClass.name}</strong><small>{(schoolClass.teacherIds ?? []).map((id) => teachers.find((teacher) => teacher.id === id)?.display_name).filter(Boolean).join(", ") || "Öğretmen atanmadı"}</small></span><button type="button" onClick={() => { setEditingClassId(editingClassId === schoolClass.id ? "" : schoolClass.id); setEditTeacherIds(schoolClass.teacherIds ?? []); }}>Atama</button></div>{editingClassId === schoolClass.id && <div className="panel-assignment"><div className="panel-checks">{teachers.filter((teacher) => teacher.active).map((teacher) => <label key={teacher.id}><input type="checkbox" checked={editTeacherIds.includes(teacher.id)} onChange={() => toggleId(editTeacherIds, teacher.id, setEditTeacherIds)} />{teacher.display_name}</label>)}</div><button className="secondary-button" type="button" disabled={busy} onClick={() => void run(async () => { await api(`/api/classes/${schoolClass.id}/teachers`, jsonRequest("PUT", { teacherIds: editTeacherIds })); setEditingClassId(""); }, "Öğretmen atamaları güncellendi.")}>Atamayı kaydet</button></div>}</div>)}</section></div>
      </> : actor.role === "teacher" ? <>
        <div className="panel-class-picker"><label>Sınıf seç<select value={selectedClassId} onChange={(event) => setSelectedClassId(event.target.value)}>{classes.map((schoolClass) => <option key={schoolClass.id} value={schoolClass.id}>{schoolClass.name}</option>)}</select></label></div>
        <div className="panel-phase3-links"><Link href="/panel/curricula">Ortak müfredatlar</Link>{selectedClassId && <Link prefetch={false} href={`/panel/classes/${selectedClassId}`}>Dersler, ödevler ve duyurular →</Link>}</div>
        {selectedClassId ? <div className="panel-grid"><section className="surface-card panel-card"><div className="panel-card-title"><span className="stat-icon blue"><GraduationCap size={20} /></span><div><h2>Öğrenci ekle</h2><p>Yeni hesap açın veya mevcut hesabı sınıfa alın.</p></div></div><div className="panel-mode"><button type="button" className={studentMode === "new" ? "active" : ""} onClick={() => setStudentMode("new")}>Yeni hesap</button><button type="button" className={studentMode === "existing" ? "active" : ""} onClick={() => setStudentMode("existing")}>Mevcut hesap</button></div><form className="panel-form" onSubmit={onAddStudent}>{studentMode === "new" && <label>Ad soyad<input name="displayName" required minLength={2} maxLength={120} placeholder="Örn. Ada Yılmaz" /></label>}<label>Kullanıcı adı<input name="username" required pattern="[a-zA-Z0-9._-]{3,32}" placeholder="ada.yilmaz" /></label>{studentMode === "new" && <label>İlk şifre<input name="password" type="password" required minLength={12} autoComplete="new-password" placeholder="En az 12 karakter" /></label>}<button className="primary-button" disabled={busy}><Plus size={17} /> {studentMode === "new" ? "Öğrenci hesabı aç" : "Sınıfa ekle"}</button></form></section>
        <section className="surface-card panel-card"><div className="panel-list-heading"><h2>Öğrenciler</h2><span>{students.length} öğrenci</span></div>{studentsLoading ? <p className="panel-empty">Öğrenciler yükleniyor…</p> : students.length === 0 ? <p className="panel-empty">Bu sınıfta henüz öğrenci yok.</p> : students.map((student) => <div className="panel-list-row" key={student.id}><span className="panel-row-icon"><GraduationCap size={18} /></span><span className="panel-row-copy"><strong>{student.display_name}</strong><small>@{student.username}</small></span><div className="panel-row-actions"><button type="button" onClick={() => setPasswordTarget({ id: student.id, name: student.display_name })}>Şifre yenile</button><button type="button" disabled={busy} onClick={() => { if (window.confirm(`${student.display_name} sınıftan çıkarılsın mı? Geçmiş kayıtları korunur.`)) void run(async () => { await api(`/api/classes/${selectedClassId}/students/${student.id}`, { method: "DELETE" }); }, "Öğrenci sınıftan çıkarıldı.", refreshStudents); }}>Sınıftan çıkar</button></div></div>)}</section></div> : <div className="surface-card panel-empty">Henüz atandığınız sınıf yok. Yöneticinizden sınıf ataması isteyin.</div>}
      </> : <section className="surface-card panel-card"><div className="panel-list-heading"><h2>Kayıtlı sınıflarım</h2><span>{classes.length} sınıf</span></div>{classes.length === 0 ? <p className="panel-empty">Henüz bir sınıfa kayıtlı değilsiniz.</p> : classes.map((schoolClass) => <div className="panel-list-row" key={schoolClass.id}><span className="panel-row-icon"><BookOpen size={18} /></span><span className="panel-row-copy"><strong>{schoolClass.name}</strong><small>Etkin kayıt</small></span><Link prefetch={false} className="panel-class-link" href={`/panel/classes/${schoolClass.id}`}>İlerlemeyi gör →</Link></div>)}</section>}
      {passwordTarget && <div className="panel-modal-backdrop"><div className="panel-modal" role="dialog" aria-modal="true" aria-labelledby="password-title"><h2 id="password-title">Şifre yenile</h2><p>{passwordTarget.name} için yeni şifre belirleyin. Eski şifre gösterilmez.</p><form className="panel-form" onSubmit={onResetPassword}><label>Yeni şifre<input name="password" type="password" required minLength={12} autoComplete="new-password" /></label><div className="panel-modal-actions"><button type="button" className="secondary-button" onClick={() => setPasswordTarget(null)}>Vazgeç</button><button type="submit" className="primary-button" disabled={busy}>Şifreyi kaydet</button></div></form></div></div>}
    </main>
  </div>;
}
