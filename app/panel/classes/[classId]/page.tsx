import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { requireActor } from "@/lib/server/auth";
import { HttpError } from "@/lib/server/http";
import { requireClassReader } from "@/lib/server/phase3";
import LearningClassClient from "@/components/learning-class-client";
import ClassContentClient from "@/components/class-content-client";
import "../../panel.css";
import "../../learning.css";
import "../../phase4.css";

export default async function LearningClassPage({ params }: { params: Promise<{ classId: string }> }) {
  await connection();
  const { classId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(classId)) notFound();
  try {
    const { actor, db } = await requireActor(["teacher", "student"]);
    if (actor.role === "admin") redirect("/panel");
    await requireClassReader(db, actor, classId);
    const clientActor = { id: actor.id, role: actor.role === "teacher" ? "teacher" : "student" } as const;
    return <main className="learning-page">
      <LearningClassClient classId={classId} actor={clientActor} />
      <ClassContentClient classId={classId} actor={clientActor} />
    </main>;
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) redirect("/sign-in");
    if (error instanceof HttpError && error.status === 403) redirect("/panel");
    throw error;
  }
}
