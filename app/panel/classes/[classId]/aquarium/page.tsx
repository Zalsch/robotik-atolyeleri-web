import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { requireActor } from "@/lib/server/auth";
import { aquariumClass } from "@/lib/server/aquarium";
import { HttpError } from "@/lib/server/http";
import PanelHeader from "@/components/panel-header";
import AquariumClient from "@/components/aquarium-client";
import "../../../aquarium.css";

export default async function AquariumPage({ params }: { params: Promise<{ classId: string }> }) {
  await connection();
  const { classId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(classId)) notFound();
  try {
    const { actor, db } = await requireActor();
    await aquariumClass(db, actor, classId);
    return <><PanelHeader actor={{ id: actor.id, role: actor.role, username: actor.username, displayName: actor.display_name }} /><main className="panel-main"><AquariumClient key={classId} classId={classId} /></main></>;
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) redirect("/sign-in");
    if (error instanceof HttpError && error.status === 403) redirect("/panel/aquarium");
    if (error instanceof HttpError && error.status === 404) notFound();
    throw error;
  }
}
