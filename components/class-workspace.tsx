"use client";

import { useState, type KeyboardEvent } from "react";
import dynamic from "next/dynamic";

type Actor = { id: string; role: "teacher" | "student" };
type Tab = "learning" | "content";
const Learning = dynamic(() => import("./learning-class-client"), { loading: () => <div className="workspace-loading" role="status">Dersler ve ilerleme yükleniyor…</div> });
const Content = dynamic(() => import("./class-content-client"), { loading: () => <div className="workspace-loading" role="status">Ödevler ve duyurular yükleniyor…</div> });

export default function ClassWorkspace({ classId, actor, initialTab }: { classId: string; actor: Actor; initialTab: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [visited, setVisited] = useState({ learning: initialTab === "learning", content: initialTab === "content" });
  function open(next: Tab) {
    setVisited((current) => ({ ...current, [next]: true }));
    setTab(next);
    const url = new URL(window.location.href);
    if (next === "content") { url.searchParams.set("tab", "content"); url.hash = "class-content"; }
    else { url.searchParams.delete("tab"); url.hash = ""; }
    window.history.replaceState(null, "", url);
  }
  function navigate(event: KeyboardEvent<HTMLButtonElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? "learning" : event.key === "End" ? "content" : tab === "learning" ? "content" : "learning";
    open(next);
    document.getElementById(`${next}-tab`)?.focus();
  }
  return <><div className="workspace-tabs" role="tablist" aria-label="Sınıf bölümleri"><button id="learning-tab" type="button" role="tab" aria-selected={tab === "learning"} aria-controls="learning-panel" tabIndex={tab === "learning" ? 0 : -1} onKeyDown={navigate} onClick={() => open("learning")}>Dersler ve ilerleme</button><button id="content-tab" type="button" role="tab" aria-selected={tab === "content"} aria-controls="content-panel" tabIndex={tab === "content" ? 0 : -1} onKeyDown={navigate} onClick={() => open("content")}>Ödevler ve duyurular</button></div><div id="learning-panel" role="tabpanel" aria-labelledby="learning-tab" hidden={tab !== "learning"}>{visited.learning && <Learning classId={classId} actor={actor} onOpenContent={() => open("content")} />}</div><div id="content-panel" role="tabpanel" aria-labelledby="content-tab" hidden={tab !== "content"}>{visited.content && <Content classId={classId} actor={actor} />}</div></>;
}
