import { requireActor, requireAssignedTeacher } from "@/lib/server/auth";
import { handleError, HttpError, readJson, throwDbError, uuidField } from "@/lib/server/http";

export async function GET(_request: Request, context: RouteContext<"/api/classes/[classId]/learning-plan">) {
  try {
    const { actor, db } = await requireActor(["teacher"]);
    const { classId } = await context.params;
    uuidField(classId, "Sınıf kimliği");
    await requireAssignedTeacher(db, actor.id, classId);
    const { data, error } = await db.from("classes")
      .select("id,name,curriculum_id,weekday,start_time,duration_minutes,schedule_effective_on")
      .eq("id", classId).single();
    throwDbError(error);
    return Response.json({ plan: data });
  } catch (error) { return handleError(error); }
}

export async function PATCH(request: Request, context: RouteContext<"/api/classes/[classId]/learning-plan">) {
  try {
    const { actor, db } = await requireActor(["teacher"]);
    const { classId } = await context.params;
    uuidField(classId, "Sınıf kimliği");
    const body = await readJson(request);
    const curriculumId = body.curriculumId === null ? null : uuidField(body.curriculumId, "Müfredat kimliği");
    let weekday: number | null = null;
    let startTime: string | null = null;
    let durationMinutes: number | null = null;
    if (body.weekday !== null || body.startTime !== null || body.durationMinutes !== null) {
      if (!Number.isInteger(body.weekday) || (body.weekday as number) < 1 || (body.weekday as number) > 7
        || typeof body.startTime !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(body.startTime)
        || !Number.isInteger(body.durationMinutes) || (body.durationMinutes as number) < 30 || (body.durationMinutes as number) > 480) {
        throw new HttpError(400, "Haftalık program geçersiz.");
      }
      weekday = body.weekday as number;
      startTime = body.startTime;
      durationMinutes = body.durationMinutes as number;
    }
    await requireAssignedTeacher(db, actor.id, classId);
    const { error } = await db.rpc("set_class_learning_plan", {
      p_teacher_id: actor.id, p_class_id: classId, p_curriculum_id: curriculumId,
      p_weekday: weekday, p_start_time: startTime, p_duration_minutes: durationMinutes,
    });
    throwDbError(error);
    return Response.json({ updated: true });
  } catch (error) { return handleError(error); }
}
