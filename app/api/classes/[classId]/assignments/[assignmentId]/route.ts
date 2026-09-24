import { requireActor } from "@/lib/server/auth";
import { handleError, readJson, textField, throwDbError, uuidField } from "@/lib/server/http";
import { currentClassRoster, descriptionField, driveUrlField, dueAtField, requireClassAssignment } from "@/lib/server/phase4";
import { allRows } from "@/lib/server/pagination";

export async function GET(_request: Request, context: RouteContext<"/api/classes/[classId]/assignments/[assignmentId]">) {
  try {
    const { actor, db } = await requireActor(["teacher"]);
    const { classId, assignmentId } = await context.params;
    uuidField(classId, "Sınıf kimliği");
    uuidField(assignmentId, "Ödev kimliği");
    const assignment = await requireClassAssignment(db, actor.id, classId, assignmentId);
    const students = await currentClassRoster(db, classId);
    const statuses = await allRows(async (from, to) => db.from("assignment_statuses")
      .select("student_id,status,updated_at").eq("assignment_id", assignmentId)
      .order("student_id").range(from, to));
    return Response.json({ assignment, students: students.map((student) => ({
      id: student.id, username: student.username, display_name: student.display_name,
      status: statuses.find((item) => item.student_id === student.id)?.status ?? null,
    })) });
  } catch (error) { return handleError(error); }
}

export async function PATCH(request: Request, context: RouteContext<"/api/classes/[classId]/assignments/[assignmentId]">) {
  try {
    const { actor, db } = await requireActor(["teacher"]);
    const { classId, assignmentId } = await context.params;
    uuidField(classId, "Sınıf kimliği");
    uuidField(assignmentId, "Ödev kimliği");
    await requireClassAssignment(db, actor.id, classId, assignmentId);
    const body = await readJson(request);
    const title = textField(body, "title");
    const description = descriptionField(body.description ?? "");
    const driveUrl = driveUrlField(body.driveUrl);
    const dueAt = dueAtField(body.dueAt);
    const { data, error } = await db.from("assignments")
      .update({ title, description, drive_url: driveUrl, due_at: dueAt, updated_at: new Date().toISOString() })
      .eq("id", assignmentId).eq("class_id", classId).eq("active", true)
      .select("id,class_id,title,description,drive_url,due_at,created_at").single();
    throwDbError(error);
    return Response.json({ assignment: data });
  } catch (error) { return handleError(error); }
}
