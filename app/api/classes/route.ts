import { requireActor } from "@/lib/server/auth";
import { handleError, HttpError, readJson, textField, throwDbError, uuidField } from "@/lib/server/http";
import { allRows, chunks } from "@/lib/server/pagination";

export async function GET() {
  try {
    const { actor, db } = await requireActor();
    let ids: string[] | null = null;
    if (actor.role === "teacher") {
      const assignments = await allRows(async (from, to) => db.from("class_teachers")
        .select("class_id").eq("teacher_id", actor.id).order("class_id").range(from, to));
      ids = assignments.map((row) => row.class_id);
    } else if (actor.role === "student") {
      const enrollments = await allRows(async (from, to) => db.from("enrollments")
        .select("class_id").eq("student_id", actor.id).is("left_at", null)
        .order("class_id").range(from, to));
      ids = enrollments.map((row) => row.class_id);
    }
    if (ids && ids.length === 0) return Response.json({ classes: [] });
    const groups = ids
      ? await Promise.all(chunks(ids).map((group) => allRows(async (from, to) => db.from("classes")
        .select("id,name,active,created_at").eq("active", true).in("id", group)
        .order("name").order("id").range(from, to))))
      : [await allRows(async (from, to) => db.from("classes")
        .select("id,name,active,created_at").eq("active", true)
        .order("name").order("id").range(from, to))];
    const classes = groups.flat().sort((a, b) => a.name.localeCompare(b.name, "tr"));
    if (actor.role !== "admin" || classes.length === 0) return Response.json({ classes });
    const assignments = (await Promise.all(chunks(classes.map((item) => item.id)).map((group) =>
      allRows(async (from, to) => db.from("class_teachers")
        .select("class_id,teacher_id").in("class_id", group)
        .order("class_id").order("teacher_id").range(from, to))))).flat();
    return Response.json({ classes: classes.map((item) => ({
      ...item,
      teacherIds: assignments.filter((assignment) => assignment.class_id === item.id)
        .map((assignment) => assignment.teacher_id),
    })) });
  } catch (error) { return handleError(error); }
}

export async function POST(request: Request) {
  try {
    const { actor, db } = await requireActor(["admin"]);
    const body = await readJson(request);
    const name = textField(body, "name");
    const teacherIds = body.teacherIds;
    if (!Array.isArray(teacherIds) || teacherIds.length > 2) throw new HttpError(400, "En fazla iki öğretmen seçin.");
    const ids = teacherIds.map((id) => uuidField(id, "Öğretmen kimliği"));
    if (new Set(ids).size !== ids.length) throw new HttpError(400, "Aynı öğretmen iki kez seçilemez.");
    const { data, error } = await db.rpc("create_class_with_teachers", {
      p_name: name, p_created_by: actor.id, p_teacher_ids: ids,
    });
    throwDbError(error);
    return Response.json({ class: data }, { status: 201 });
  } catch (error) { return handleError(error); }
}
