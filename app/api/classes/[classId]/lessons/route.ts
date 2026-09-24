import { requireActor, requireAssignedTeacher } from "@/lib/server/auth";
import { handleError, throwDbError, uuidField } from "@/lib/server/http";
import { allRows } from "@/lib/server/pagination";

export async function GET(_request: Request, context: RouteContext<"/api/classes/[classId]/lessons">) {
  try {
    const { actor, db } = await requireActor(["teacher"]);
    const { classId } = await context.params;
    uuidField(classId, "Sınıf kimliği");
    await requireAssignedTeacher(db, actor.id, classId);
    const through = new Date(Date.now() + 182 * 86_400_000).toISOString().slice(0, 10);
    const { error: ensureError } = await db.rpc("ensure_class_lessons", { p_class_id: classId, p_through: through });
    throwDbError(ensureError);
    const lessons = await allRows(async (from, to) => db.from("lessons")
      .select("id,class_id,scheduled_on,scheduled_at,actual_at,duration_minutes,status,attendance_completed_at")
      .eq("class_id", classId).order("scheduled_at").range(from, to));
    return Response.json({ lessons });
  } catch (error) { return handleError(error); }
}
