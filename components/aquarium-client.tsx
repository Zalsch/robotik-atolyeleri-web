"use client";

import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent, type MouseEvent } from "react";
import { Fish, Sparkles } from "lucide-react";
import { createAquariumMotion } from "@/lib/aquarium-motion";
import "@/app/panel/aquarium.css";

type Student = { id: string; name: string; points: number; type: string; color: string };
type Reward = { id: string; studentId: string; points: number; createdAt: string };
type Aquarium = { students: Student[]; rewards: Reward[]; viewerStudentId: string | null; canAward: boolean; className: string };
type AwardResult = { reward: Reward; totalPoints: number };
type Motion = ReturnType<typeof createAquariumMotion>;

function FishArt({ type, color }: { type: string; color: string }) {
  return <svg className="aq-fish-art" viewBox="0 0 100 66" aria-hidden="true" style={{ color: /^#[0-9a-f]{6}$/i.test(color) ? color : "#72d9c3" }}>
    <g fill="currentColor"><path className="aq-tail" d="M30 33L7 15Q2 33 7 52Z" />{type === "round" ? <ellipse cx="51" cy="33" rx="29" ry="25" /> : <path d="M23 33Q40 7 65 15Q79 20 85 33Q75 53 55 51Q34 51 23 33Z" />}<path className="aq-fin" d="M41 20L48 4L61 17M44 47L51 61L65 48" opacity=".7" /></g>
    {type === "striped" && <path d="M43 17L39 45M56 15L51 50M67 19L63 48" stroke="#fff" strokeOpacity=".55" strokeWidth="5" />}
    <path className="aq-side-fin" d="M44 30Q32 37 47 43" fill="#fff" opacity=".25" /><circle cx="72" cy="28" r="5" fill="#fff" /><circle cx="74" cy="28" r="2.5" fill="#13314a" /><path className="aq-mouth-rest" d="M79 39Q83 42 86 37" stroke="#153c4d" strokeWidth="2" fill="none" /><ellipse className="aq-mouth-open" cx="84" cy="38" rx="4" ry="5" fill="#153c4d" />
  </svg>;
}

export default function AquariumClient({ classId }: { classId: string }) {
  // A class change has its own request baseline and animation lifetime.
  return <AquariumView key={classId} classId={classId} />;
}

function AquariumView({ classId }: { classId: string }) {
  const [data, setData] = useState<Aquarium | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [studentId, setStudentId] = useState("");
  const [points, setPoints] = useState(1);
  const [busy, setBusy] = useState(false);
  const schoolRef = useRef<HTMLDivElement>(null);
  const foodRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef(new Map<string, HTMLDivElement>());
  const motionRef = useRef<Motion | null>(null);
  const seenRef = useRef(new Set<string>());
  const incomingRef = useRef<Reward[]>([]);
  const busyRef = useRef(false);
  const aliveRef = useRef(true);
  const postAbortRef = useRef<AbortController | null>(null);
  const retryRef = useRef<{ studentId: string; points: number; requestId: string } | null>(null);
  const refreshRef = useRef<(() => Promise<void>) | null>(null);
  const path = `/api/classes/${encodeURIComponent(classId)}/aquarium`;

  useEffect(() => {
    aliveRef.current = true;
    const motion = createAquariumMotion(schoolRef.current!, foodRef.current!);
    motionRef.current = motion;
    return () => { aliveRef.current = false; postAbortRef.current?.abort(); motion.destroy(); motionRef.current = null; };
  }, []);

  useEffect(() => {
    let closed = false, inFlight = false, initialized = false;
    let controller: AbortController | null = null;
    const refresh = async () => {
      if (closed || inFlight || document.hidden) return;
      inFlight = true; controller = new AbortController();
      try {
        const response = await fetch(path, { cache: "no-store", signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Akvaryum yüklenemedi.");
        if (closed) return;
        const next = body as Aquarium;
        for (const reward of next.rewards) {
          if (initialized && !seenRef.current.has(reward.id)) incomingRef.current.push(reward);
          seenRef.current.add(reward.id);
        }
        initialized = true;
        setData((current) => {
          const totals = new Map(current?.students.map((student) => [student.id, student.points]));
          return { ...next, students: next.students.map((student) => ({ ...student, points: Math.max(student.points, totals.get(student.id) ?? 0) })) };
        });
        setStudentId((current) => next.students.some((student) => student.id === current) ? current : next.students[0]?.id ?? "");
        setError("");
      } catch (failure) {
        if (!closed && !(failure instanceof DOMException && failure.name === "AbortError")) setError(failure instanceof Error ? failure.message : "Akvaryum yüklenemedi.");
      } finally { inFlight = false; if (!closed) setLoading(false); }
    };
    refreshRef.current = refresh;
    void refresh();
    const interval = window.setInterval(() => { void refresh(); }, 30_000);
    const visible = () => { if (!document.hidden) void refresh(); };
    document.addEventListener("visibilitychange", visible);
    return () => { closed = true; controller?.abort(); window.clearInterval(interval); document.removeEventListener("visibilitychange", visible); refreshRef.current = null; };
  }, [path]);

  useEffect(() => {
    if (!data) return;
    motionRef.current?.sync(data.students.flatMap((student) => {
      const element = nodesRef.current.get(student.id);
      return element ? [{ id: student.id, type: student.type, element }] : [];
    }));
    for (const reward of incomingRef.current.splice(0)) motionRef.current?.reward(reward.studentId, reward.points);
  }, [data]);

  async function award(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data?.canAward || busyRef.current || !studentId || !Number.isInteger(points) || points < 1 || points > 10) return;
    busyRef.current = true; setBusy(true); setError(""); setNotice("");
    const pending = retryRef.current?.studentId === studentId && retryRef.current.points === points ? retryRef.current : { studentId, points, requestId: crypto.randomUUID() };
    retryRef.current = pending;
    const controller = new AbortController(); postAbortRef.current = controller;
    try {
      const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(pending), signal: controller.signal });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Puan eklenemedi.");
      if (!aliveRef.current) return;
      const result = body as AwardResult;
      retryRef.current = null;
      if (!seenRef.current.has(result.reward.id)) { seenRef.current.add(result.reward.id); incomingRef.current.push(result.reward); }
      setData((current) => current ? { ...current, students: current.students.map((student) => student.id === result.reward.studentId ? { ...student, points: Math.max(student.points, result.totalPoints) } : student) } : current);
      const name = data.students.find((student) => student.id === result.reward.studentId)?.name ?? "Öğrenci";
      setNotice(`${name}: ${points} puan eklendi. Balığı yemini otomatik alıyor.`);
    } catch (failure) {
      if (aliveRef.current && !(failure instanceof DOMException && failure.name === "AbortError")) setError(`${failure instanceof Error ? failure.message : "Puan eklenemedi."} Aynı işlemi tekrar deneyebilirsiniz.`);
    } finally { busyRef.current = false; if (aliveRef.current) setBusy(false); }
  }

  function callFish(event: MouseEvent<HTMLDivElement>) {
    if (!data?.viewerStudentId || !schoolRef.current) return;
    const rect = schoolRef.current.getBoundingClientRect();
    motionRef.current?.call(data.viewerStudentId, event.clientX - rect.left, event.clientY - rect.top);
  }
  function callCenter(event: KeyboardEvent<HTMLDivElement>) {
    if (!data?.viewerStudentId || !schoolRef.current || !["Enter", " "].includes(event.key)) return;
    event.preventDefault();
    motionRef.current?.call(data.viewerStudentId, schoolRef.current.clientWidth / 2, schoolRef.current.clientHeight / 2);
  }
  const displayName = (student: Student) => data?.viewerStudentId ? student.name.split(" ")[0] : student.name;
  const total = data?.students.reduce((sum, student) => sum + student.points, 0) ?? 0;
  const ownFish = data?.students.find((student) => student.id === data.viewerStudentId);
  return <section className="aquarium-page" aria-labelledby="aq-title">
    <div className="aq-heading"><div><span className="eyebrow">BİRLİKTE BÜYÜYEN BİR DÜNYA</span><h1 id="aq-title">Sınıf akvaryumu</h1><p>{data?.className ?? "Sınıfınızın balıkları hazırlanıyor"}</p></div><span className="aq-live"><i /> Sınıf akvaryumu</span></div>
    <div className="aq-summary"><article><Fish size={21} /><div><strong>{data?.students.length ?? "—"}</strong><span>Öğrenci balığı</span></div></article><article><Sparkles size={21} /><div><strong>{total.toLocaleString("tr-TR")} puan</strong><span>Sınıfın toplamı</span></div></article>{ownFish && <article><span className="aq-own-icon"><FishArt type={ownFish.type} color={ownFish.color} /></span><div><strong>{ownFish.points.toLocaleString("tr-TR")} puan</strong><span>Benim puanım</span></div></article>}</div>
    {error && <div className="aq-error" role="alert"><span>{error}</span><button type="button" onClick={() => { void refreshRef.current?.(); }}>Yenile</button></div>}
    <section className="aq-tank-panel"><div className="aq-section-heading"><h2>Birlikte keşfediyoruz <span aria-hidden="true">✧</span></h2><span>Sakin sular</span></div>
      <div className={`aq-tank${ownFish ? " aq-callable" : ""}`} role={ownFish ? "button" : "group"} tabIndex={ownFish ? 0 : undefined} aria-label={ownFish ? "Balığını çağırmak için akvaryumda bir yere dokun. Klavyede Enter ile ortaya çağır." : "Sınıf akvaryumu"} aria-describedby="aq-hint" onClick={callFish} onKeyDown={callCenter} style={{ "--aq-mobile-height": `${Math.max(520, Math.ceil((data?.students.length ?? 0) / 2) * 112 + 72)}px`, "--aq-desktop-height": `${Math.max(380, Math.ceil((data?.students.length ?? 0) / 5) * 100 + 72)}px` } as CSSProperties}>
        <div className="aq-water-glow" aria-hidden="true" /><div className="aq-rays" aria-hidden="true" /><div className="aq-bubble aq-bubble-one" aria-hidden="true" /><div className="aq-bubble aq-bubble-two" aria-hidden="true" />
        <div className="aq-plant aq-plant-left" aria-hidden="true"><i /><i /><i /><i /></div><div className="aq-plant aq-plant-right" aria-hidden="true"><i /><i /><i /><i /></div>
        <div ref={schoolRef} className="aq-school">{data?.students.map((student) => <div key={student.id} ref={(node) => { if (node) nodesRef.current.set(student.id, node); else nodesRef.current.delete(student.id); }} className={`aq-fish-card${student.id === data.viewerStudentId ? " aq-my-fish" : ""}`} data-student={student.id} aria-label={`${displayName(student)}, ${student.points} puan`}><span className="aq-fish-visual"><FishArt type={student.type} color={student.color} /></span><span className="aq-fish-name">{student.name.split(" ")[0]}{student.id === data.viewerStudentId ? " · ben" : ""}</span><span className="aq-fish-points">{student.points.toLocaleString("tr-TR")} puan</span></div>)}</div>
        <div ref={foodRef} className="aq-food-layer" aria-hidden="true" /><div className="aq-sand" aria-hidden="true" /><span className="aq-caption">{data?.className ?? "Akvaryum"}</span>
        {loading && <p className="aq-tank-empty" role="status">Balıklar yükleniyor…</p>}{!loading && data && !data.students.length && <p className="aq-tank-empty">Bu sınıfa öğrenci eklendiğinde balıkları burada görünecek.</p>}
      </div><p id="aq-hint" className="aq-hint">{ownFish ? "Bir yere dokun, kendi balığın yanına gelsin. Puanlar öğretmenin tarafından eklenir." : "Puan verildiğinde yemler suya düşer; puanı alan öğrencinin balığı otomatik yer."} Puanlar korunur. Sınıf bilgileri 30 saniyede bir yenilenir.</p>
    </section>
    <div className={`aq-bottom${data?.canAward ? " aq-bottom-teacher" : ""}`}>
      <section className="aq-card"><h2>Akvaryum ekibi</h2><div className="aq-roster">{data?.students.map((student) => <div className="aq-roster-row" key={student.id}><span className="aq-mini-fish"><FishArt type={student.type} color={student.color} /></span><strong>{displayName(student)}</strong><span>{student.points.toLocaleString("tr-TR")} puan</span></div>)}</div></section>
      {data?.canAward && <section className="aq-card"><span className="eyebrow">ÖĞRETMEN PANELİ</span><h2>Puan ekle</h2><p>Öğrencini seç. Puanı eklensin, balığı ödülünü alsın.</p><form className="aq-award-form" onSubmit={award}><label htmlFor="aq-student">Öğrenci</label><select id="aq-student" value={studentId} disabled={busy || !data.students.length} onChange={(event) => { setStudentId(event.target.value); retryRef.current = null; }}>{data.students.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}</select><label htmlFor="aq-points">Puan</label><input id="aq-points" type="number" min={1} max={10} step={1} required value={points} disabled={busy} onChange={(event) => { setPoints(Number(event.target.value)); retryRef.current = null; }} /><button className="primary-button" type="submit" disabled={busy || !studentId || !Number.isInteger(points) || points < 1 || points > 10}><Sparkles size={16} />{busy ? "Ekleniyor…" : "Puan ekle"}</button></form></section>}
    </div><p className="aq-notice" role="status" aria-live="polite">{notice}</p>
  </section>;
}
