import { requireActor, requireAssignedTeacher } from "@/lib/server/auth";
import { ensureSameOrigin, handleError, throwDbError, uuidField } from "@/lib/server/http";

export async function DELETE(request: Request, context: RouteContext<"/api/classes/[classId]/students/[studentId]">) {
  try {
    const { actor, db } = await requireActor(["teacher"]);
    ensureSameOrigin(request);
    const { classId, studentId } = await context.params;
    uuidField(classId, "Sınıf kimliği");
    uuidField(studentId, "Öğrenci kimliği");
    await requireAssignedTeacher(db, actor.id, classId);
    const { data: stillActive, error } = await db.rpc("remove_student_from_class", {
      p_class_id: classId, p_student_id: studentId,
    });
    throwDbError(error);
    return Response.json({ removed: true, accountActive: Boolean(stillActive) });
  } catch (error) { return handleError(error); }
}
