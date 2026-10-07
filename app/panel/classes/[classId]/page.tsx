import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { requireActor } from "@/lib/server/auth";
import { HttpError } from "@/lib/server/http";
import { requireClassReader } from "@/lib/server/phase3";
import ClassWorkspace from "@/components/class-workspace";
import PanelHeader from "@/components/panel-header";
import "../../panel.css";
import "../../learning.css";
import "../../phase4.css";

export default async function LearningClassPage({ params, searchParams }: { params: Promise<{ classId: string }>; searchParams: Promise<{ tab?: string }> }) {
  await connection();
  const { classId } = await params;
  const initialTab = (await searchParams).tab === "content" ? "content" : "learning";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(classId)) notFound();
  try {
    const { actor, db } = await requireActor(["teacher", "student"]);
    if (actor.role === "admin") redirect("/panel");
    await requireClassReader(db, actor, classId);
    const clientActor = { id: actor.id, role: actor.role === "teacher" ? "teacher" : "student" } as const;
    return <><PanelHeader actor={{ id: actor.id, role: actor.role, username: actor.username, displayName: actor.display_name }} /><main className="learning-page">
      <ClassWorkspace key={`${classId}:${initialTab}`} classId={classId} actor={clientActor} initialTab={initialTab} />
    </main></>;
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) redirect("/sign-in");
    if (error instanceof HttpError && error.status === 403) redirect("/panel");
    throw error;
  }
}
