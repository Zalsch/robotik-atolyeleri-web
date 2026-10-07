import { redirect } from "next/navigation";
import { connection } from "next/server";
import { requireActor } from "@/lib/server/auth";
import { HttpError } from "@/lib/server/http";
import CurriculaClient from "@/components/curricula-client";
import PanelHeader from "@/components/panel-header";
import "../panel.css";
import "../learning.css";

export default async function CurriculaPage() {
  await connection();
  try {
    const { actor } = await requireActor(["teacher"]);
    return <><PanelHeader actor={{ id: actor.id, role: actor.role, username: actor.username, displayName: actor.display_name }} /><CurriculaClient /></>;
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) redirect("/sign-in");
    if (error instanceof HttpError && error.status === 403) redirect("/panel");
    throw error;
  }
}
