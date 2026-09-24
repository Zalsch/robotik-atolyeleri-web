import { requireActor, requireAssignedTeacher } from "@/lib/server/auth";
import { handleError, HttpError, readJson, throwDbError, uuidField } from "@/lib/server/http";

export async function POST(request: Request, context: RouteContext<"/api/classes/[classId]/students/[studentId]/topics/[topicId]">) {
  try {
    const { actor, db } = await requireActor(["teacher"]);
    const { classId, studentId, topicId } = await context.params;
    uuidField(classId, "Sınıf kimliği");
    uuidField(studentId, "Öğrenci kimliği");
    uuidField(topicId, "Konu kimliği");
    await requireAssignedTeacher(db, actor.id, classId);
    const body = await readJson(request);
    if (typeof body.complete !== "boolean") throw new HttpError(400, "Konu durumu geçersiz.");
    const { error } = await db.rpc("set_topic_completion", {
      p_teacher_id: actor.id, p_class_id: classId,
      p_student_id: studentId, p_topic_id: topicId, p_complete: body.complete,
    });
    throwDbError(error);
    return Response.json({ completed: body.complete });
  } catch (error) { return handleError(error); }
}
