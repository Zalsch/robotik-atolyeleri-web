import { requireActor, requireAssignedTeacher } from "@/lib/server/auth";
import { handleError, readJson, textField, throwDbError, uuidField } from "@/lib/server/http";
import { allRows, chunks } from "@/lib/server/pagination";
import { requireClassReader } from "@/lib/server/phase3";
import { descriptionField, driveUrlField, dueAtField } from "@/lib/server/phase4";

export async function GET(_request: Request, context: RouteContext<"/api/classes/[classId]/assignments">) {
  try {
    const { actor, db } = await requireActor(["teacher", "student"]);
    const { classId } = await context.params;
    uuidField(classId, "Sınıf kimliği");
    await requireClassReader(db, actor, classId);
    const assignments = await allRows(async (from, to) => db.from("assignments")
      .select("id,class_id,title,description,drive_url,due_at,created_at")
      .eq("class_id", classId).eq("active", true)
      .order("due_at", { ascending: false }).order("id").range(from, to));
    if (actor.role === "teacher" || assignments.length === 0) return Response.json({ assignments });
    const groups = await Promise.all(chunks(assignments.map((assignment) => assignment.id)).map(async (ids) => {
      const { data, error } = await db.from("assignment_statuses")
        .select("assignment_id,status,updated_at").eq("student_id", actor.id).in("assignment_id", ids);
      throwDbError(error);
      return data ?? [];
    }));
    const statuses = groups.flat();
    return Response.json({ assignments: assignments.map((assignment) => ({
      ...assignment, status: statuses.find((status) => status.assignment_id === assignment.id)?.status ?? null,
    })) });
  } catch (error) { return handleError(error); }
}

export async function POST(request: Request, context: RouteContext<"/api/classes/[classId]/assignments">) {
  try {
    const { actor, db } = await requireActor(["teacher"]);
    const { classId } = await context.params;
    uuidField(classId, "Sınıf kimliği");
    await requireAssignedTeacher(db, actor.id, classId);
    const body = await readJson(request);
    const title = textField(body, "title");
    const description = descriptionField(body.description ?? "");
    const driveUrl = driveUrlField(body.driveUrl);
    const dueAt = dueAtField(body.dueAt);
    const { data, error } = await db.from("assignments")
      .insert({ class_id: classId, title, description, drive_url: driveUrl, due_at: dueAt, created_by: actor.id })
      .select("id,class_id,title,description,drive_url,due_at,created_at").single();
    throwDbError(error);
    return Response.json({ assignment: data }, { status: 201 });
  } catch (error) { return handleError(error); }
}
