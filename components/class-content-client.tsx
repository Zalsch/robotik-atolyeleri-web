"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Bell, BookOpenCheck, Check, ExternalLink } from "lucide-react";
import PushSubscriptionClient from "./push-subscription-client";

type Actor = { id: string; role: "teacher" | "student" };
type Assignment = {
  id: string; title: string; description: string; drive_url: string; due_at: string;
  created_at: string; status?: "getirdi" | "getirmedi" | null;
};
type Announcement = { id: string; title: string; body: string; created_at: string };
type Student = { id: string; username: string; display_name: string; status: "getirdi" | "getirmedi" | null };
type AssignmentForm = { title: string; description: string; driveUrl: string; dueAt: string };
const emptyForm: AssignmentForm = { title: "", description: "", driveUrl: "", dueAt: "" };

async function request<T>(path: string, method = "GET", data?: unknown): Promise<T> {
  const response = await fetch(path, {
    method, cache: "no-store",
    headers: data === undefined ? undefined : { "Content-Type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? "İşlem tamamlanamadı.");
  return body as T;
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function localInput(value: string) {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

function assignmentPayload(form: AssignmentForm) {
  return { title: form.title, description: form.description, driveUrl: form.driveUrl,
    dueAt: form.dueAt ? new Date(`${form.dueAt}:00+03:00`).toISOString() : "" };
}

export default function ClassContentClient({ classId, actor }: { classId: string; actor: Actor }) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<{ assignment: Assignment; students: Student[] } | null>(null);
  const [newAssignment, setNewAssignment] = useState<AssignmentForm>(emptyForm);
  const [editAssignment, setEditAssignment] = useState<AssignmentForm>(emptyForm);
  const [announcementForm, setAnnouncementForm] = useState({ title: "", body: "" });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(async () => {
    const [assignmentResult, announcementResult] = await Promise.all([
      request<{ assignments: Assignment[] }>(`/api/classes/${classId}/assignments`),
      request<{ announcements: Announcement[] }>(`/api/classes/${classId}/announcements`),
    ]);
    setAssignments(assignmentResult.assignments);
    setAnnouncements(announcementResult.announcements);
    if (actor.role === "teacher") setSelectedId((current) =>
      assignmentResult.assignments.some((assignment) => assignment.id === current)
        ? current : assignmentResult.assignments[0]?.id ?? "");
  }, [actor.role, classId]);

  useEffect(() => {
    void refresh().catch((cause) => setError(cause instanceof Error ? cause.message : "İçerik yüklenemedi."))
      .finally(() => setLoading(false));
  }, [refresh]);

  useEffect(() => {
    if (actor.role !== "teacher" || !selectedId) { setDetail(null); return; }
    setDetail(null);
    void request<{ assignment: Assignment; students: Student[] }>(`/api/classes/${classId}/assignments/${selectedId}`)
      .then((result) => {
        setDetail(result);
        setEditAssignment({ title: result.assignment.title, description: result.assignment.description,
          driveUrl: result.assignment.drive_url, dueAt: localInput(result.assignment.due_at) });
      }).catch((cause) => setError(cause instanceof Error ? cause.message : "Ödev ayrıntısı yüklenemedi."));
  }, [actor.role, classId, selectedId, refreshKey]);

  async function run(action: () => Promise<void>, message: string) {
    setBusy(true); setError(""); setNotice("");
    try { await action(); await refresh(); setRefreshKey((value) => value + 1); setNotice(message); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "İşlem tamamlanamadı."); }
    finally { setBusy(false); }
  }

  function createAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run(async () => {
      const result = await request<{ assignment: Assignment }>(`/api/classes/${classId}/assignments`, "POST", assignmentPayload(newAssignment));
      setSelectedId(result.assignment.id);
      setNewAssignment(emptyForm);
    }, "Ödev sınıfa eklendi.");
  }

  function saveAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId) return;
    void run(async () => { await request(`/api/classes/${classId}/assignments/${selectedId}`, "PATCH", assignmentPayload(editAssignment)); }, "Ödev güncellendi.");
  }

  function createAnnouncement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run(async () => {
      await request(`/api/classes/${classId}/announcements`, "POST", announcementForm);
      setAnnouncementForm({ title: "", body: "" });
    }, "Duyuru sınıfın uygulama içi listesine eklendi.");
  }

  return <div id="class-content" className="learning-shell phase4-shell">
    <div className="learning-heading"><span className="eyebrow">SINIF İÇERİĞİ</span><h2>Ödevler ve duyurular</h2><p>{actor.role === "teacher" ? "Drive bağlantılı ödevleri ve fiziksel teslim durumunu yönetin; sınıfa duyuru yazın." : "Ödevlerinizi, fiziksel teslim durumunuzu ve sınıf duyurularını burada görün."}</p></div>
    {error && <div className="panel-alert error" role="alert">{error}</div>}
    {notice && <div className="panel-alert success" role="status"><Check size={16} /> {notice}</div>}
    {loading ? <div className="learning-card">İçerik yükleniyor…</div> : <div className="learning-columns">
      <section className="learning-card"><div className="learning-section-title"><BookOpenCheck size={19} /><h2>Ödevler</h2></div>
        {actor.role === "teacher" && <form className="learning-form" onSubmit={createAssignment}>
          <h3>Ödev ekle</h3>
          <label>Başlık<input value={newAssignment.title} onChange={(event) => setNewAssignment({ ...newAssignment, title: event.target.value })} required maxLength={120} /></label>
          <label>Açıklama<textarea value={newAssignment.description} onChange={(event) => setNewAssignment({ ...newAssignment, description: event.target.value })} maxLength={2000} rows={3} /></label>
          <label>Google Drive PDF bağlantısı<input type="url" value={newAssignment.driveUrl} onChange={(event) => setNewAssignment({ ...newAssignment, driveUrl: event.target.value })} required placeholder="https://drive.google.com/file/d/..." /></label>
          <label>Son tarih (Türkiye saati)<input type="datetime-local" value={newAssignment.dueAt} onChange={(event) => setNewAssignment({ ...newAssignment, dueAt: event.target.value })} required /></label>
          <button className="primary-button" disabled={busy}>Ödev ekle</button>
        </form>}
        {assignments.length === 0 ? <p className="learning-muted">Henüz ödev eklenmedi.</p> : <div className="phase4-list">{assignments.map((assignment) => <article className="phase4-item" key={assignment.id}>
          <div className="phase4-item-head"><strong>{assignment.title}</strong>{actor.role === "student" && <span className={`phase4-status ${assignment.status ?? "pending"}`}>{assignment.status === "getirdi" ? "Getirdi" : assignment.status === "getirmedi" ? "Getirmedi" : "Henüz işaretlenmedi"}</span>}</div>
          <p className="learning-muted">Son tarih: {dateLabel(assignment.due_at)}</p>
          {assignment.description && <p className="phase4-description">{assignment.description}</p>}
          <a className="learning-link" href={assignment.drive_url} target="_blank" rel="noopener noreferrer">PDF bağlantısını aç <ExternalLink size={13} /></a>
          {actor.role === "teacher" && <button type="button" className="learning-text-button" onClick={() => setSelectedId(assignment.id)}>Teslim durumlarını gör →</button>}
        </article>)}</div>}
        {actor.role === "teacher" && detail?.assignment.id === selectedId && <div className="phase4-detail">
          <h3>{detail.assignment.title} · teslim durumu</h3>
          {detail.students.length === 0 ? <p className="learning-muted">Bu sınıfta etkin öğrenci yok.</p> : detail.students.map((student) => <div className="learning-attendance-row" key={student.id}><span><strong>{student.display_name}</strong><small>@{student.username}</small></span><div className="learning-segment"><button type="button" className={student.status === "getirdi" ? "selected" : ""} disabled={busy} onClick={() => void run(async () => { await request(`/api/classes/${classId}/assignments/${selectedId}/status`, "POST", { studentId: student.id, status: "getirdi" }); }, "Teslim durumu güncellendi.")}>Getirdi</button><button type="button" className={student.status === "getirmedi" ? "selected absent" : ""} disabled={busy} onClick={() => void run(async () => { await request(`/api/classes/${classId}/assignments/${selectedId}/status`, "POST", { studentId: student.id, status: "getirmedi" }); }, "Teslim durumu güncellendi.")}>Getirmedi</button></div></div>)}
          <details><summary>Ödevi düzenle</summary><form className="learning-form" onSubmit={saveAssignment}>
            <label>Başlık<input value={editAssignment.title} onChange={(event) => setEditAssignment({ ...editAssignment, title: event.target.value })} required maxLength={120} /></label>
            <label>Açıklama<textarea value={editAssignment.description} onChange={(event) => setEditAssignment({ ...editAssignment, description: event.target.value })} maxLength={2000} rows={3} /></label>
            <label>Google Drive bağlantısı<input type="url" value={editAssignment.driveUrl} onChange={(event) => setEditAssignment({ ...editAssignment, driveUrl: event.target.value })} required /></label>
            <label>Son tarih (Türkiye saati)<input type="datetime-local" value={editAssignment.dueAt} onChange={(event) => setEditAssignment({ ...editAssignment, dueAt: event.target.value })} required /></label>
            <button className="secondary-button" disabled={busy}>Değişiklikleri kaydet</button>
          </form></details>
        </div>}
      </section>
      <section className="learning-card"><div className="learning-section-title"><Bell size={19} /><h2>Duyurular</h2></div>
        {actor.role === "student" && <PushSubscriptionClient />}
        {actor.role === "teacher" && <form className="learning-form" onSubmit={createAnnouncement}>
          <label>Başlık<input value={announcementForm.title} onChange={(event) => setAnnouncementForm({ ...announcementForm, title: event.target.value })} required maxLength={120} /></label>
          <label>Mesaj<textarea value={announcementForm.body} onChange={(event) => setAnnouncementForm({ ...announcementForm, body: event.target.value })} required minLength={2} maxLength={4000} rows={4} /></label>
          <button className="primary-button" disabled={busy}>Sınıfa duyur</button>
        </form>}
        {announcements.length === 0 ? <p className="learning-muted">Henüz duyuru yok.</p> : <div className="phase4-list">{announcements.map((announcement) => <article className="phase4-item" key={announcement.id}><strong>{announcement.title}</strong><small>{dateLabel(announcement.created_at)}</small><p className="phase4-description">{announcement.body}</p></article>)}</div>}
      </section>
    </div>}
  </div>;
}
