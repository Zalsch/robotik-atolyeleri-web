import { requireActor } from "@/lib/server/auth";
import { handleError, HttpError, readJson, throwDbError, uuidField } from "@/lib/server/http";
import { lessonRoster, requireClassLesson } from "@/lib/server/phase3";

export async function GET(_request: Request, context: RouteContext<"/api/classes/[classId]/lessons/[lessonId]">) {
  try {
    const { actor, db } = await requireActor(["teacher"]);
    const { classId, lessonId } = await context.params;
    uuidField(classId, "Sınıf kimliği");
    uuidField(lessonId, "Ders kimliği");
    const lesson = await requireClassLesson(db, actor.id, classId, lessonId);
    const roster = await lessonRoster(db, classId, lessonId, lesson.actual_at ?? lesson.scheduled_at);
    return Response.json({ lesson, roster });
  } catch (error) { return handleError(error); }
}

export async function PATCH(request: Request, context: RouteContext<"/api/classes/[classId]/lessons/[lessonId]">) {
  try {
    const { actor, db } = await requireActor(["teacher"]);
    const { classId, lessonId } = await context.params;
    uuidField(classId, "Sınıf kimliği");
    uuidField(lessonId, "Ders kimliği");
    await requireClassLesson(db, actor.id, classId, lessonId);
    const body = await readJson(request);
    if (typeof body.cancelled !== "boolean") throw new HttpError(400, "Ders durumu geçersiz.");
    let actualAt: string | null = null;
    if (body.actualAt !== null) {
      if (typeof body.actualAt !== "string" || !/T.*(Z|[+-]\d{2}:\d{2})$/.test(body.actualAt)
        || Number.isNaN(Date.parse(body.actualAt))) throw new HttpError(400, "Ders tarihi geçersiz.");
      actualAt = new Date(body.actualAt).toISOString();
    }
    if (body.cancelled && actualAt) throw new HttpError(400, "İptal edilen ders taşınamaz.");
    const { error } = await db.rpc("set_lesson_exception", {
      p_teacher_id: actor.id, p_lesson_id: lessonId, p_cancelled: body.cancelled, p_actual_at: actualAt,
    });
    throwDbError(error);
    return Response.json({ updated: true });
  } catch (error) { return handleError(error); }
}
