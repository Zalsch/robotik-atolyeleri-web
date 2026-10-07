import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { requireActor } from "@/lib/server/auth";
import { HttpError } from "@/lib/server/http";
import { allRows, chunks } from "@/lib/server/pagination";
import PanelHeader from "@/components/panel-header";

export default async function AquariumClassesPage() {
  await connection();
  try {
    const { actor, db } = await requireActor();
    let ids: string[] | null = null;
    if (actor.role === "teacher") {
      const rows = await allRows(async (from, to) => db.from("class_teachers").select("class_id").eq("teacher_id", actor.id).order("class_id").range(from, to));
      ids = rows.map((row) => row.class_id);
    } else if (actor.role === "student") {
      const rows = await allRows(async (from, to) => db.from("enrollments").select("class_id").eq("student_id", actor.id).is("left_at", null).order("id").range(from, to));
      ids = [...new Set(rows.map((row) => row.class_id))];
    }
    const groups = ids === null ? [null] : chunks(ids);
    const classes = (await Promise.all(groups.map((group) => allRows(async (from, to) => {
      let query = db.from("classes").select("id,name").eq("active", true);
      if (group) query = query.in("id", group);
      return query.order("name").order("id").range(from, to);
    })))).flat();
    return <><PanelHeader actor={{ id: actor.id, role: actor.role, username: actor.username, displayName: actor.display_name }} /><main className="panel-main"><div className="dashboard-welcome"><div><span className="eyebrow">SINIF AKVARYUMLARI</span><h1>Akvaryum</h1><p>{actor.role === "teacher" ? "Sınıfınızı açın; öğrencilerinize puan verin ve balıklarının ödülünü izleyin." : "Sınıfınızın balıklarını birlikte izleyin."}</p></div></div><section className="dashboard-card"><h2>Sınıf seç</h2>{classes.length ? classes.map((schoolClass) => <Link prefetch={false} className="dashboard-row" key={schoolClass.id} href={`/panel/classes/${schoolClass.id}/aquarium`}><span><strong>{schoolClass.name}</strong><small>Akvaryumu aç</small></span><span aria-hidden="true">→</span></Link>) : <p className="dashboard-empty">Sınıf kaydınız oluşturulduğunda akvaryum burada görünür.</p>}</section></main></>;
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) redirect("/sign-in");
    throw error;
  }
}
