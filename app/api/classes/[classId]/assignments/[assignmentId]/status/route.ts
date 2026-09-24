import { requireActor } from "@/lib/server/auth";
import { handleError, HttpError, readJson, throwDbError, uuidField } from "@/lib/server/http";
import { requireClassAssignment } from "@/lib/server/phase4";

export async function POST(request: Request, context: RouteContext<"/api/classes/[classId]/assignments/[assignmentId]/status">) {
  try {
    const { actor, db } = await requireActor(["teacher"]);
    const { classId, assignmentId } = await context.params;
    uuidField(classId, "Sınıf kimliği");
    uuidField(assignmentId, "Ödev kimliği");
    await requireClassAssignment(db, actor.id, classId, assignmentId);
    const body = await readJson(request);
    const studentId = uuidField(body.studentId, "Öğrenci kimliği");
    if (body.status !== "getirdi" && body.status !== "getirmedi") throw new HttpError(400, "Ödev durumu geçersiz.");
    const { error } = await db.rpc("mark_assignment_status", {
      p_teacher_id: actor.id, p_assignment_id: assignmentId, p_student_id: studentId, p_status: body.status,
    });
    throwDbError(error);
    return Response.json({ updated: true });
  } catch (error) { return handleError(error); }
}
