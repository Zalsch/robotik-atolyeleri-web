import { requireActor } from "@/lib/server/auth";
import { handleError, HttpError, readJson, throwDbError, uuidField } from "@/lib/server/http";

export async function PUT(request: Request, context: RouteContext<"/api/classes/[classId]/teachers">) {
  try {
    const { db } = await requireActor(["admin"]);
    const { classId } = await context.params;
    uuidField(classId, "Sınıf kimliği");
    const body = await readJson(request);
    const teacherIds = body.teacherIds;
    if (!Array.isArray(teacherIds) || teacherIds.length > 2) throw new HttpError(400, "En fazla iki öğretmen seçin.");
    const ids = teacherIds.map((id) => uuidField(id, "Öğretmen kimliği"));
    if (new Set(ids).size !== ids.length) throw new HttpError(400, "Aynı öğretmen iki kez seçilemez.");
    const { error } = await db.rpc("set_class_teachers", { p_class_id: classId, p_teacher_ids: ids });
    throwDbError(error);
    return Response.json({ teacherIds: ids });
  } catch (error) { return handleError(error); }
}
