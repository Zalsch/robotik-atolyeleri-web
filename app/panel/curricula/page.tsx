import { redirect } from "next/navigation";
import { connection } from "next/server";
import { requireActor } from "@/lib/server/auth";
import { HttpError } from "@/lib/server/http";
import CurriculaClient from "@/components/curricula-client";
import "../panel.css";
import "../learning.css";

export default async function CurriculaPage() {
  await connection();
  try {
    await requireActor(["teacher"]);
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) redirect("/sign-in");
    if (error instanceof HttpError && error.status === 403) redirect("/panel");
    throw error;
  }
  return <CurriculaClient />;
}
