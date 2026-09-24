"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { BookOpen, CalendarDays, Check, ClipboardCheck, GraduationCap } from "lucide-react";

type Actor = { id: string; role: "teacher" | "student" };
type Topic = { id: string; title: string; description: string; pdf_url: string | null; pdf_visible: boolean; position: number; completedAt: string | null };
type Curriculum = { id: string; title: string; topics: { id: string; title: string; position: number }[] };
type Plan = { id: string; name: string; curriculum_id: string | null; weekday: number | null; start_time: string | null; duration_minutes: number | null };
type Lesson = { id: string; scheduled_on: string; scheduled_at: string; actual_at: string | null; duration_minutes: number; status: "planned" | "cancelled"; attendance_completed_at: string | null };
type RosterStudent = { id: string; username: string; display_name: string; status: "var" | "yok" | null };
type Learning = { class: Plan; curriculum: { id: string; title: string } | null; topics: Topic[]; summary: { total_topics: number; completed_topics: number; completed_lessons: number; present_lessons: number }; lessons: (Lesson & { attendance: "var" | "yok" | null })[] };

const weekdays = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];

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

function lessonDate(lesson: Lesson) {
  return new Intl.DateTimeFormat("tr-TR", {
    timeZone: "Europe/Istanbul", dateStyle: "medium", timeStyle: "short",
  }).format(new Date(lesson.actual_at ?? lesson.scheduled_at));
}

function lessonLabel(lesson: Lesson) {
  return `${lessonDate(lesson)}${lesson.status === "cancelled" ? " · İptal" : lesson.actual_at ? " · Taşındı" : ""}${lesson.attendance_completed_at ? " · Yoklama tamam" : ""}`;
}

export default function LearningClassClient({ classId, actor }: { classId: string; actor: Actor }) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [curricula, setCurricula] = useState<Curriculum[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [students, setStudents] = useState<{ id: string; display_name: string }[]>([]);
  const [selectedLessonId, setSelectedLessonId] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState(actor.role === "student" ? actor.id : "");
  const [lessonDetail, setLessonDetail] = useState<{ lesson: Lesson; roster: RosterStudent[] } | null>(null);
  const [learning, setLearning] = useState<Learning | null>(null);
  const [planForm, setPlanForm] = useState({ curriculumId: "", weekday: "", startTime: "", durationMinutes: "90" });
  const [movedTo, setMovedTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);

  const refresh = useCallback(async () => {
    if (actor.role === "student") {
      const result = await request<Learning>(`/api/classes/${classId}/students/${actor.id}/learning`);
      setLearning(result);
      setPlan(result.class);
      return;
    }
    const [planResult, curriculaResult, lessonsResult, studentsResult] = await Promise.all([
      request<{ plan: Plan }>(`/api/classes/${classId}/learning-plan`),
      request<{ curricula: Curriculum[] }>("/api/curricula"),
      request<{ lessons: Lesson[] }>(`/api/classes/${classId}/lessons`),
      request<{ students: { id: string; display_name: string }[] }>(`/api/classes/${classId}/students`),
    ]);
    setPlan(planResult.plan);
    setCurricula(curriculaResult.curricula);
    setLessons(lessonsResult.lessons);
    setStudents(studentsResult.students);
    setPlanForm({
      curriculumId: planResult.plan.curriculum_id ?? "",
      weekday: planResult.plan.weekday ? String(planResult.plan.weekday) : "",
      startTime: planResult.plan.start_time?.slice(0, 5) ?? "",
      durationMinutes: String(planResult.plan.duration_minutes ?? 90),
    });
    setSelectedStudentId((current) => studentsResult.students.some((student) => student.id === current)
      ? current : studentsResult.students[0]?.id ?? "");
    setSelectedLessonId((current) => {
      if (lessonsResult.lessons.some((lesson) => lesson.id === current)) return current;
      const now = Date.now();
      return [...lessonsResult.lessons].reverse().find((lesson) =>
        lesson.status === "planned" && !lesson.attendance_completed_at
        && Date.parse(lesson.actual_at ?? lesson.scheduled_at) <= now)?.id
        ?? lessonsResult.lessons.find((lesson) => Date.parse(lesson.actual_at ?? lesson.scheduled_at) > now)?.id
        ?? lessonsResult.lessons.at(-1)?.id ?? "";
    });
  }, [actor.id, actor.role, classId]);

  const refreshLesson = useCallback(async () => {
    if (!selectedLessonId || actor.role !== "teacher") { setLessonDetail(null); return; }
    setLessonDetail(await request<{ lesson: Lesson; roster: RosterStudent[] }>(
      `/api/classes/${classId}/lessons/${selectedLessonId}`));
  }, [actor.role, classId, selectedLessonId]);

  const refreshLearning = useCallback(async () => {
    if (!selectedStudentId) { setLearning(null); return; }
    setLearning(await request<Learning>(`/api/classes/${classId}/students/${selectedStudentId}/learning`));
  }, [classId, selectedStudentId]);

  useEffect(() => {
    void refresh().catch((cause) => setError(cause instanceof Error ? cause.message : "Veriler alınamadı."))
      .finally(() => setLoading(false));
  }, [refresh]);
  useEffect(() => {
    void refreshLesson().catch((cause) => setError(cause instanceof Error ? cause.message : "Ders alınamadı."));
  }, [refreshLesson, refreshVersion]);
  useEffect(() => {
    if (actor.role === "teacher") void refreshLearning()
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Öğrenci verileri alınamadı."));
  }, [actor.role, refreshLearning, refreshVersion]);

  async function run(action: () => Promise<void>, message: string) {
    setBusy(true); setError(""); setNotice("");
    try {
      await action();
      await refresh();
      setRefreshVersion((current) => current + 1);
      setNotice(message);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "İşlem tamamlanamadı."); }
    finally { setBusy(false); }
  }

  function savePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run(async () => {
      await request(`/api/classes/${classId}/learning-plan`, "PATCH", {
        curriculumId: planForm.curriculumId || null,
        weekday: planForm.weekday ? Number(planForm.weekday) : null,
        startTime: planForm.weekday ? planForm.startTime : null,
        durationMinutes: planForm.weekday ? Number(planForm.durationMinutes) : null,
      });
    }, "Sınıfın müfredatı ve haftalık programı kaydedildi.");
  }

  const selectedLesson = lessons.find((lesson) => lesson.id === selectedLessonId);
  const canTakeAttendance = lessonDetail?.lesson.status === "planned"
    && Date.parse(lessonDetail.lesson.actual_at ?? lessonDetail.lesson.scheduled_at) <= Date.now();
  const totalTopics = Number(learning?.summary.total_topics ?? 0);
  const completedTopics = Number(learning?.summary.completed_topics ?? 0);
  const completedLessons = Number(learning?.summary.completed_lessons ?? 0);
  const presentLessons = Number(learning?.summary.present_lessons ?? 0);

  return <div><div className="learning-shell">
    <a className="learning-back" href="/panel">← Sınıflarıma dön</a>
    <div className="learning-heading"><span className="eyebrow">{actor.role === "teacher" ? "ÖĞRETMEN · SINIF" : "ÖĞRENCİ / VELİ · SINIF"}</span><h1>{plan?.name ?? "Sınıf ayrıntısı"}</h1><p>{actor.role === "teacher" ? "Müfredatı, dersleri ve öğrenci ilerlemesini yönetin." : "Ders programınızı, konu ilerlemenizi ve yoklamanızı görün."}</p><a className="learning-link learning-jump" href="#class-content">Ödevler ve duyurular ↓</a></div>
    {error && <div className="panel-alert error" role="alert">{error}</div>}
    {notice && <div className="panel-alert success" role="status"><Check size={16} /> {notice}</div>}
    {loading ? <div className="learning-card">Yükleniyor…</div> : actor.role === "teacher" ? <>
      <div className="learning-columns">
        <section className="learning-card"><div className="learning-section-title"><BookOpen size={19} /><h2>Müfredat ve haftalık program</h2></div>
          <p className="learning-muted">Saatler Türkiye saatine göredir. Program değişince geçmiş dersler korunur.</p>
          <form className="learning-form" onSubmit={savePlan}>
            <label>Ortak müfredat<select value={planForm.curriculumId} onChange={(event) => setPlanForm({ ...planForm, curriculumId: event.target.value })}><option value="">Henüz seçilmedi</option>{curricula.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
            <div className="learning-form-grid"><label>Gün<select value={planForm.weekday} onChange={(event) => setPlanForm({ ...planForm, weekday: event.target.value })}><option value="">Program yok</option>{weekdays.map((day, index) => <option key={day} value={index + 1}>{day}</option>)}</select></label><label>Saat<input type="time" value={planForm.startTime} onChange={(event) => setPlanForm({ ...planForm, startTime: event.target.value })} required={Boolean(planForm.weekday)} disabled={!planForm.weekday} /></label><label>Süre (dakika)<input type="number" min={30} max={480} value={planForm.durationMinutes} onChange={(event) => setPlanForm({ ...planForm, durationMinutes: event.target.value })} required={Boolean(planForm.weekday)} disabled={!planForm.weekday} /></label></div>
            <button className="primary-button" disabled={busy}>Programı kaydet</button>
          </form>
          <a className="learning-link" href="/panel/curricula">Ortak müfredat ve konuları düzenle →</a>
        </section>
        <section className="learning-card"><div className="learning-section-title"><CalendarDays size={19} /><h2>Dersler</h2></div>
          {lessons.length === 0 ? <p className="learning-muted">Haftalık program kaydedilince dersler burada görünür.</p> : <>
            <label className="learning-picker">Ders seç<select value={selectedLessonId} onChange={(event) => setSelectedLessonId(event.target.value)}>{lessons.map((lesson) => <option value={lesson.id} key={lesson.id}>{lessonLabel(lesson)}</option>)}</select></label>
            {selectedLesson && <div className="learning-lesson-detail"><strong>{lessonLabel(selectedLesson)}</strong><p>{selectedLesson.duration_minutes} dakika{selectedLesson.actual_at ? " · Haftalık saatten farklı" : ""}</p>
              {!selectedLesson.attendance_completed_at && <div className="learning-actions"><button type="button" className="secondary-button" disabled={busy} onClick={() => void run(() => request(`/api/classes/${classId}/lessons/${selectedLesson.id}`, "PATCH", { cancelled: selectedLesson.status !== "cancelled", actualAt: null }).then(() => {}), selectedLesson.status === "cancelled" ? "Ders yeniden açıldı." : "Ders iptal edildi.")}>{selectedLesson.status === "cancelled" ? "İptali geri al" : "Dersi iptal et"}</button><button type="button" className="learning-text-button" disabled={busy || !selectedLesson.actual_at} onClick={() => void run(() => request(`/api/classes/${classId}/lessons/${selectedLesson.id}`, "PATCH", { cancelled: false, actualAt: null }).then(() => {}), "Ders haftalık saatine döndü.")}>Taşımayı geri al</button></div>}
              {!selectedLesson.attendance_completed_at && <form className="learning-form learning-inline-form" onSubmit={(event) => { event.preventDefault(); if (!movedTo) return; const actualAt = new Date(`${movedTo}:00+03:00`).toISOString(); void run(async () => { await request(`/api/classes/${classId}/lessons/${selectedLesson.id}`, "PATCH", { cancelled: false, actualAt }); setMovedTo(""); }, "Ders yeni tarihe taşındı."); }}><label>Tek dersi başka tarihe taşı (Türkiye saati)<input type="datetime-local" value={movedTo} onChange={(event) => setMovedTo(event.target.value)} required /></label><button className="secondary-button" disabled={busy}>Taşı</button></form>}
            </div>}
          </>}
        </section>
      </div>
      <div className="learning-columns">
        <section className="learning-card"><div className="learning-section-title"><ClipboardCheck size={19} /><h2>Yoklama</h2></div>
          {!selectedLesson ? <p className="learning-muted">Önce ders programını kaydedin.</p> : lessonDetail ? <>
            <p className="learning-muted">{lessonLabel(lessonDetail.lesson)}. Derse kayıtlı her öğrenciyi işaretleyip yoklamayı tamamlayın.</p>
            {lessonDetail.roster.map((student) => <div className="learning-attendance-row" key={student.id}><span><strong>{student.display_name}</strong><small>@{student.username}</small></span><div className="learning-segment"><button type="button" className={student.status === "var" ? "selected" : ""} disabled={busy || !canTakeAttendance} onClick={() => void run(() => request(`/api/classes/${classId}/lessons/${selectedLesson.id}/attendance`, "POST", { studentId: student.id, status: "var" }).then(() => {}), "Yoklama güncellendi.")}>Var</button><button type="button" className={student.status === "yok" ? "selected absent" : ""} disabled={busy || !canTakeAttendance} onClick={() => void run(() => request(`/api/classes/${classId}/lessons/${selectedLesson.id}/attendance`, "POST", { studentId: student.id, status: "yok" }).then(() => {}), "Yoklama güncellendi.")}>Yok</button></div></div>)}
            {lessonDetail.roster.length === 0 && <p className="learning-muted">Bu ders tarihinde kayıtlı öğrenci yok.</p>}
            {canTakeAttendance && !lessonDetail.lesson.attendance_completed_at && <button type="button" className="primary-button learning-finalize" disabled={busy || lessonDetail.roster.length === 0 || lessonDetail.roster.some((student) => !student.status)} onClick={() => void run(() => request(`/api/classes/${classId}/lessons/${selectedLesson.id}/attendance`, "POST", { finalize: true }).then(() => {}), "Yoklama tamamlandı; devam oranları güncellendi.")}>Yoklamayı tamamla</button>}
            {!canTakeAttendance && <p className="learning-muted">Yoklama ders başladıktan sonra işaretlenebilir.</p>}
          </> : <p className="learning-muted">Ders ayrıntısı yükleniyor…</p>}
        </section>
        <section className="learning-card"><div className="learning-section-title"><GraduationCap size={19} /><h2>Öğrenci ilerlemesi</h2></div>
          {students.length === 0 ? <p className="learning-muted">Bu sınıfta henüz öğrenci yok.</p> : <><label className="learning-picker">Öğrenci seç<select value={selectedStudentId} onChange={(event) => setSelectedStudentId(event.target.value)}>{students.map((student) => <option key={student.id} value={student.id}>{student.display_name}</option>)}</select></label>{learning ? <>
            <div className="learning-stats"><div><strong>{completedTopics}/{totalTopics}</strong><span>Tamamlanan konu</span></div><div><strong>{completedLessons ? `%${Math.round(presentLessons / completedLessons * 100)}` : "—"}</strong><span>Devam oranı ({presentLessons}/{completedLessons})</span></div></div>
            <h3>{learning.curriculum?.title ?? "Müfredat seçilmedi"}</h3>
            {learning.topics.map((topic) => <div className="learning-topic-detail" key={topic.id}><label className="learning-topic-check"><input type="checkbox" checked={Boolean(topic.completedAt)} disabled={busy} onChange={(event) => void run(() => request(`/api/classes/${classId}/students/${selectedStudentId}/topics/${topic.id}`, "POST", { complete: event.target.checked }).then(() => {}), "Konu ilerlemesi güncellendi.")} /><strong>{topic.title}</strong></label>{topic.description && <p>{topic.description}</p>}{topic.pdf_url && <a className="learning-link" href={topic.pdf_url} target="_blank" rel="noopener noreferrer">Ders kazanım PDF’ini aç ↗</a>}{!topic.pdf_visible && topic.pdf_url && <small className="learning-muted">PDF öğrencilere kapalı.</small>}</div>)}
            {learning.topics.length === 0 && <p className="learning-muted">Henüz konu başlığı yok.</p>}
          </> : <p className="learning-muted">İlerleme yükleniyor…</p>}</>}
        </section>
      </div>
    </> : learning ? <>
      <div className="learning-stats learning-stats-wide"><div><strong>{completedTopics}/{totalTopics}</strong><span>Tamamlanan konu</span></div><div><strong>{completedLessons ? `%${Math.round(presentLessons / completedLessons * 100)}` : "—"}</strong><span>Devam oranı ({presentLessons}/{completedLessons})</span></div></div>
      <div className="learning-columns"><section className="learning-card"><div className="learning-section-title"><BookOpen size={19} /><h2>{learning.curriculum?.title ?? "Müfredat"}</h2></div>{learning.topics.length === 0 ? <p className="learning-muted">Sınıfınıza henüz müfredat ve konu eklenmedi.</p> : learning.topics.map((topic) => <div className="learning-student-topic" key={topic.id}><span className="learning-number">{String(topic.position).padStart(2, "0")}</span><div><div className="learning-student-topic-heading"><strong>{topic.title}</strong><span className={topic.completedAt ? "learning-done" : "learning-muted"}>{topic.completedAt ? "Tamamlandı" : "Bekliyor"}</span></div>{topic.description && <p>{topic.description}</p>}{topic.pdf_url && <a className="learning-link" href={topic.pdf_url} target="_blank" rel="noopener noreferrer">Ders kazanım PDF’ini aç ↗</a>}</div></div>)}</section>
        <section className="learning-card"><div className="learning-section-title"><CalendarDays size={19} /><h2>Dersler ve yoklama</h2></div>
          <h3>Yaklaşan dersler</h3>{learning.lessons.filter((lesson) => lesson.status === "planned" && Date.parse(lesson.actual_at ?? lesson.scheduled_at) >= Date.now()).slice(0, 4).map((lesson) => <div className="learning-history-row" key={lesson.id}><strong>{lessonDate(lesson)}</strong><span>{lesson.duration_minutes} dakika</span></div>)}
          <h3>Yoklama geçmişi</h3>{learning.lessons.filter((lesson) => lesson.attendance_completed_at).reverse().map((lesson) => <div className="learning-history-row" key={lesson.id}><strong>{lessonDate(lesson)}</strong><span className={lesson.attendance === "var" ? "learning-done" : "learning-absent"}>{lesson.attendance === "var" ? "Var" : lesson.attendance === "yok" ? "Yok" : "Kayıt yok"}</span></div>)}
          {completedLessons === 0 && <p className="learning-muted">Henüz tamamlanmış yoklama yok.</p>}
        </section></div>
    </> : <div className="learning-card">Sınıf verileri yükleniyor…</div>}
  </div></div>;
}
