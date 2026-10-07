"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { BookOpen, Check, Plus } from "lucide-react";

type Topic = { id: string; title: string; description: string; pdf_url: string | null; pdf_visible: boolean; position: number };
type Curriculum = { id: string; title: string; topics: Topic[] };

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

export default function CurriculaClient() {
  const [curricula, setCurricula] = useState<Curriculum[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [renameTitle, setRenameTitle] = useState("");
  const [newTopic, setNewTopic] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newPdfUrl, setNewPdfUrl] = useState("");
  const [editingTopic, setEditingTopic] = useState<Topic | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    const result = await request<{ curricula: Curriculum[] }>("/api/curricula");
    setCurricula(result.curricula);
    setSelectedId((current) => result.curricula.some((item) => item.id === current)
      ? current : result.curricula[0]?.id ?? "");
  }, []);

  useEffect(() => {
    void refresh().catch((cause) => setError(cause instanceof Error ? cause.message : "Veriler alınamadı."))
      .finally(() => setLoading(false));
  }, [refresh]);

  const selected = curricula.find((item) => item.id === selectedId);

  async function run(action: () => Promise<void>, message: string) {
    setBusy(true); setError(""); setNotice("");
    try { await action(); await refresh(); setNotice(message); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "İşlem tamamlanamadı."); }
    finally { setBusy(false); }
  }

  function createCurriculum(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = newTitle.trim();
    void run(async () => {
      const result = await request<{ curriculum: Curriculum }>("/api/curricula", "POST", { title });
      setSelectedId(result.curriculum.id);
      setNewTitle("");
    }, "Müfredat oluşturuldu.");
  }

  function renameCurriculum(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const title = renameTitle.trim();
    void run(async () => {
      await request(`/api/curricula/${selected.id}`, "PATCH", { title });
      setRenameTitle("");
    }, "Müfredat adı güncellendi. Bağlı sınıflarda da görünür.");
  }

  function addTopic(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const title = newTopic.trim();
    const description = newDescription.trim();
    const pdfUrl = newPdfUrl.trim();
    void run(async () => {
      await request(`/api/curricula/${selected.id}/topics`, "POST", { title, description, pdfUrl });
      setNewTopic(""); setNewDescription(""); setNewPdfUrl("");
    }, "Konu eklendi.");
  }

  function saveTopic(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !editingTopic) return;
    const topicId = editingTopic.id;
    const title = editingTopic.title.trim();
    const description = editingTopic.description.trim();
    const pdfUrl = editingTopic.pdf_url?.trim() ?? "";
    void run(async () => {
      await request(`/api/curricula/${selected.id}/topics/${topicId}`, "PATCH", { title, description, pdfUrl });
      setEditingTopic(null);
    }, "Konu bilgileri güncellendi. Bağlı sınıflarda da görünür.");
  }

  function togglePdf(topic: Topic) {
    if (!selected) return;
    void run(async () => {
      await request(`/api/curricula/${selected.id}/topics/${topic.id}`, "PATCH", { pdfVisible: !topic.pdf_visible });
    }, topic.pdf_visible ? "PDF tüm bağlı sınıflarda kapatıldı." : "PDF tüm bağlı sınıflarda açıldı.");
  }

  return <div className="learning-page">
    <div className="learning-shell">
      <Link className="learning-back" href="/panel">← Dashboard’a dön</Link>
      <div className="learning-heading"><span className="eyebrow">ORTAK İÇERİK</span><h1>Müfredatlar</h1><p>Konu başlığı, kısa açıklama ve PDF bağlantısı ekleyin. PDF görünürlüğü bu müfredatı kullanan tüm sınıflarda birlikte değişir.</p></div>
      {error && <div className="panel-alert error" role="alert">{error}</div>}
      {notice && <div className="panel-alert success" role="status"><Check size={16} /> {notice}</div>}
      {loading ? <div className="learning-card">Yükleniyor…</div> : <div className="learning-columns">
        <section className="learning-card"><div className="learning-section-title"><BookOpen size={19} /><h2>Ortak müfredatlar</h2></div>
          <form className="learning-form" onSubmit={createCurriculum}><label>Yeni müfredat adı<input value={newTitle} onChange={(event) => setNewTitle(event.target.value)} required minLength={2} maxLength={120} placeholder="Örn. Robotik 101" /></label><button className="primary-button" disabled={busy}><Plus size={16} /> Oluştur</button></form>
          <div className="learning-list">{curricula.map((item) => <button type="button" className={item.id === selectedId ? "learning-list-item selected" : "learning-list-item"} key={item.id} onClick={() => { setSelectedId(item.id); setEditingTopic(null); }}><strong>{item.title}</strong><small>{item.topics.length} konu</small></button>)}</div>
          {curricula.length === 0 && <p className="learning-muted">Henüz müfredat yok. İlk müfredatı oluşturun.</p>}
        </section>
        <section className="learning-card"><div className="learning-section-title"><BookOpen size={19} /><h2>{selected?.title ?? "Konu başlıkları"}</h2></div>
          {selected ? <>
            <form className="learning-form learning-inline-form" onSubmit={renameCurriculum}><label>Müfredat adını değiştir<input value={renameTitle} onChange={(event) => setRenameTitle(event.target.value)} required minLength={2} maxLength={120} placeholder={selected.title} /></label><button className="secondary-button" disabled={busy}>Kaydet</button></form>
            <div className="learning-topic-list">{selected.topics.map((topic) => <div className="learning-topic-card" key={topic.id}><div className="learning-topic-card-main"><span className="learning-number">{String(topic.position).padStart(2, "0")}</span><div><strong>{topic.title}</strong><p>{topic.description || "Henüz kısa açıklama eklenmedi."}</p>{topic.pdf_url ? <a className="learning-link" href={topic.pdf_url} target="_blank" rel="noopener noreferrer">PDF bağlantısını kontrol et ↗</a> : <small className="learning-muted">PDF bağlantısı eklenmedi.</small>}</div></div><div className="learning-topic-card-actions"><button type="button" className="learning-text-button" disabled={busy} onClick={() => setEditingTopic({ ...topic })}>Düzenle</button><button type="button" className="secondary-button" disabled={busy || !topic.pdf_url} onClick={() => togglePdf(topic)}>{topic.pdf_visible ? "PDF’yi kapat" : "PDF’yi aç"}</button><span className={topic.pdf_visible ? "learning-pdf-state open" : "learning-pdf-state"}>{topic.pdf_visible ? "Öğrencilere açık" : "Öğrencilere kapalı"}</span></div></div>)}</div>
            {selected.topics.length === 0 && <p className="learning-muted">Bu müfredatta henüz konu yok.</p>}
            {editingTopic && <form className="learning-form learning-topic-form" onSubmit={saveTopic}><h3>Konu bilgilerini düzenle</h3><label>Konu başlığı<input value={editingTopic.title} onChange={(event) => setEditingTopic({ ...editingTopic, title: event.target.value })} required minLength={2} maxLength={120} /></label><label>Kısa açıklama<textarea value={editingTopic.description} onChange={(event) => setEditingTopic({ ...editingTopic, description: event.target.value })} maxLength={500} rows={3} placeholder="Öğrencinin bu konuda öğreneceklerini kısaca yazın." /></label><label>Ders kazanım PDF bağlantısı<input type="url" value={editingTopic.pdf_url ?? ""} onChange={(event) => setEditingTopic({ ...editingTopic, pdf_url: event.target.value })} placeholder="https://drive.google.com/file/d/..." /></label><div className="learning-form-actions"><button className="secondary-button" disabled={busy}>Kaydet</button><button type="button" className="learning-text-button" onClick={() => setEditingTopic(null)}>Vazgeç</button></div></form>}
            <form className="learning-form learning-topic-form" onSubmit={addTopic}><h3>Yeni konu ekle</h3><label>Konu başlığı<input value={newTopic} onChange={(event) => setNewTopic(event.target.value)} required minLength={2} maxLength={120} placeholder="Örn. Sensörlerle tanışma" /></label><label>Kısa açıklama<textarea value={newDescription} onChange={(event) => setNewDescription(event.target.value)} maxLength={500} rows={3} placeholder="Bu konuda neler öğreneceğiz?" /></label><label>Ders kazanım PDF bağlantısı <small>(isteğe bağlı)</small><input type="url" value={newPdfUrl} onChange={(event) => setNewPdfUrl(event.target.value)} placeholder="https://drive.google.com/file/d/..." /></label><p className="learning-muted">Yeni PDF öğrencilere kapalı başlar. Hazır olduğunuzda yukarıdan açın.</p><button className="primary-button" disabled={busy}><Plus size={16} /> Konu ekle</button></form>
          </> : <p className="learning-muted">Önce bir müfredat seçin.</p>}
        </section>
      </div>}
    </div>
  </div>;
}
