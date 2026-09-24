"use client";

import { useState, type FormEvent } from "react";
import { BookOpen, Check, Plus, Users, X } from "lucide-react";

type PreviewStudent = { name: string; username: string };
type PreviewCurriculum = { id: number; title: string; topics: string[] };

const initialStudents: PreviewStudent[] = [
  { name: "Ada Yılmaz", username: "ada.yilmaz" },
  { name: "Can Demir", username: "can.demir" },
  { name: "Elif Kaya", username: "elif.kaya" },
  { name: "Mert Arslan", username: "mert.arslan" },
];

const initialCurricula: PreviewCurriculum[] = [
  {
    id: 1,
    title: "Robotik 101",
    topics: ["Robotik dünyasına giriş", "Temel devre elemanları", "Sensörlerle tanışma", "Motorlar ve hareket"],
  },
];

export function TeacherStudents() {
  const [students, setStudents] = useState(initialStudents);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [initialPassword, setInitialPassword] = useState("");
  const [notice, setNotice] = useState("");

  function addStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanName = name.trim();
    const cleanUsername = username.trim().toLowerCase();
    if (!cleanName || !cleanUsername || !initialPassword) return;
    if (students.some((student) => student.username === cleanUsername)) {
      setNotice("Bu kullanıcı adı örnek listede zaten var.");
      return;
    }
    setStudents((current) => [...current, { name: cleanName, username: cleanUsername }]);
    setName("");
    setUsername("");
    setInitialPassword("");
    setShowForm(false);
    setNotice(`${cleanName} örnek listeye eklendi. Gerçek hesap oluşturulmadı.`);
  }

  return (
    <section className="surface-card management-card" aria-labelledby="students-heading">
      <div className="management-heading">
        <div>
          <span className="eyebrow">ROBOTİK 101 · A SINIFI</span>
          <h2 id="students-heading">Öğrenciler</h2>
          <p>Sınıfa öğrenci hesabı ekleme akışı</p>
        </div>
        <button className="primary-button" type="button" onClick={() => { setShowForm((open) => !open); setNotice(""); }} aria-expanded={showForm}>
          {showForm ? <X size={17} /> : <Plus size={17} />}{showForm ? "Vazgeç" : "Öğrenci ekle"}
        </button>
      </div>

      {showForm && (
        <form className="management-form" onSubmit={addStudent}>
          <div className="form-intro"><Users size={18} /><span>Yeni öğrenci · Robotik 101 A</span></div>
          <div className="form-grid">
            <label>Ad soyad<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Örn. Deniz Aksoy" autoComplete="off" required /></label>
            <label>Kullanıcı adı<input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Örn. deniz.aksoy" autoComplete="off" required /></label>
            <label className="full-width">İlk şifre<input value={initialPassword} onChange={(event) => setInitialPassword(event.target.value)} type="password" placeholder="Öğrenciye verilecek ilk şifre" autoComplete="new-password" required /></label>
          </div>
          <p className="form-hint">Önizleme yalnızca ekran akışını gösterir. Şifre saklanmaz, gerçek hesap Faz 2&apos;de oluşturulur.</p>
          <button className="primary-button" type="submit"><Plus size={17} /> Örnek listeye ekle</button>
        </form>
      )}

      {notice && <p className="inline-notice" role="status">{notice}</p>}
      <div className="management-list">
        {students.map((student) => (
          <div className="management-row" key={student.username}>
            <span className="student-avatar">{student.name.split(" ").map((part) => part[0]).slice(0, 2).join("").toLocaleUpperCase("tr-TR")}</span>
            <span><strong>{student.name}</strong><small>@{student.username}</small></span>
            <span className="active-label"><Check size={14} /> Aktif</span>
          </div>
        ))}
      </div>
      <p className="list-note">{students.length} örnek öğrenci gösteriliyor · Bu önizlemede değişiklikler sayfa yenilenince sıfırlanır.</p>
    </section>
  );
}

export function TeacherCurricula() {
  const [curricula, setCurricula] = useState(initialCurricula);
  const [selectedId, setSelectedId] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [topicsInput, setTopicsInput] = useState("");
  const [showTopicForm, setShowTopicForm] = useState(false);
  const [newTopic, setNewTopic] = useState("");
  const [notice, setNotice] = useState("");
  const selected = curricula.find((item) => item.id === selectedId) ?? curricula[0];

  function addCurriculum(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) return;
    const topics = topicsInput.split("\n").map((topic) => topic.trim()).filter(Boolean);
    const id = Date.now();
    setCurricula((current) => [...current, { id, title: cleanTitle, topics }]);
    setSelectedId(id);
    setTitle("");
    setTopicsInput("");
    setShowForm(false);
    setNotice(`${cleanTitle} örnek müfredat listesine eklendi.`);
  }

  function addTopic(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanTopic = newTopic.trim();
    if (!cleanTopic) return;
    setCurricula((current) => current.map((item) => item.id === selectedId ? { ...item, topics: [...item.topics, cleanTopic] } : item));
    setNewTopic("");
    setShowTopicForm(false);
    setNotice(`“${cleanTopic}” örnek konu listesine eklendi.`);
  }

  return (
    <>
      <div className="welcome-row management-welcome">
        <div><span className="eyebrow">ORTAK İÇERİK</span><h1>Müfredat</h1><p>Bir müfredat birden fazla sınıfta kullanılabilir.</p></div>
        <button className="primary-button" type="button" onClick={() => { setShowForm((open) => !open); setNotice(""); }} aria-expanded={showForm}>
          {showForm ? <X size={17} /> : <Plus size={17} />}{showForm ? "Vazgeç" : "Müfredat oluştur"}
        </button>
      </div>

      {showForm && (
        <form className="surface-card management-form curriculum-form" onSubmit={addCurriculum}>
          <div className="form-intro"><BookOpen size={18} /><span>Yeni ortak müfredat</span></div>
          <label>Müfredat adı<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Örn. Robotik 103" required /></label>
          <label>Konu başlıkları <small>(isteğe bağlı, her satıra bir konu)</small><textarea value={topicsInput} onChange={(event) => setTopicsInput(event.target.value)} placeholder={"Robotik dünyasına giriş\nDevre elemanları"} rows={4} /></label>
          <p className="form-hint">Oluşturulan müfredat sınıflara daha sonra bağlanabilir. Bu önizlemedeki kayıtlar kalıcı değildir.</p>
          <button className="primary-button" type="submit"><Plus size={17} /> Örnek müfredat oluştur</button>
        </form>
      )}

      {notice && <p className="inline-notice" role="status">{notice}</p>}
      <div className="curriculum-layout">
        <section className="surface-card curriculum-list-card" aria-label="Müfredatlar">
          <span className="eyebrow">ORTAK MÜFREDATLAR</span>
          <div className="curriculum-list">
            {curricula.map((item) => (
              <button className={item.id === selectedId ? "selected" : ""} type="button" key={item.id} onClick={() => { setSelectedId(item.id); setNotice(""); }}>
                <span className="curriculum-icon"><BookOpen size={19} /></span>
                <span><strong>{item.title}</strong><small>{item.topics.length} konu başlığı</small></span>
              </button>
            ))}
          </div>
        </section>

        <section className="surface-card curriculum-detail" aria-labelledby="topics-heading">
          <div className="management-heading">
            <div><span className="eyebrow">{selected.title.toLocaleUpperCase("tr-TR")}</span><h2 id="topics-heading">Konu başlıkları</h2></div>
            <button className="secondary-button" type="button" onClick={() => setShowTopicForm((open) => !open)} aria-expanded={showTopicForm}><Plus size={16} /> Konu ekle</button>
          </div>
          {showTopicForm && <form className="topic-form" onSubmit={addTopic}><label>Yeni konu başlığı<input value={newTopic} onChange={(event) => setNewTopic(event.target.value)} placeholder="Örn. Hareket sensörleri" required /></label><button className="primary-button" type="submit">Ekle</button></form>}
          {selected.topics.length === 0 ? <p className="empty-state">Henüz konu eklenmedi. İlk konuyu ekleyerek başlayabilirsin.</p> : (
            <div className="topic-list">
              {selected.topics.map((topic, index) => (
                <div className="topic-row" key={`${selected.id}-${index}`}><span className="topic-number">{String(index + 1).padStart(2, "0")}</span><div><strong>{topic}</strong><small>Ortak müfredat konusu</small></div></div>
              ))}
            </div>
          )}
          <p className="list-note">Bu müfredattaki değişiklikler bağlı sınıfların tümünde görünür.</p>
        </section>
      </div>
    </>
  );
}
