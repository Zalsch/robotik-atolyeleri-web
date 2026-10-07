import { requireActor, requireAssignedTeacher } from "@/lib/server/auth";
import { loadAquarium } from "@/lib/server/aquarium";
import { handleError, HttpError, readJson, throwDbError, uuidField } from "@/lib/server/http";

export async function GET(_request: Request, context: RouteContext<"/api/classes/[classId]/aquarium">) {
  try {
    const { actor, db } = await requireActor();
    const { classId } = await context.params;
    uuidField(classId, "Sınıf kimliği");
    return Response.json(await loadAquarium(db, actor, classId), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return handleError(error); }
}

export async function POST(request: Request, context: RouteContext<"/api/classes/[classId]/aquarium">) {
  try {
    const { actor, db } = await requireActor(["teacher"]);
    const { classId } = await context.params;
    uuidField(classId, "Sınıf kimliği");
    await requireAssignedTeacher(db, actor.id, classId);
    const body = await readJson(request);
    const studentId = uuidField(body.studentId, "Öğrenci kimliği");
    const requestId = uuidField(body.requestId, "İşlem kimliği");
    if (typeof body.points !== "number" || !Number.isInteger(body.points) || body.points < 1 || body.points > 10) {
      throw new HttpError(400, "Puan 1–10 arası bir tam sayı olmalı.");
    }
    const { data, error } = await db.rpc("award_aquarium_points", {
      p_teacher_id: actor.id, p_class_id: classId, p_student_id: studentId, p_points: body.points, p_request_id: requestId,
    });
    throwDbError(error);
    const row = data?.[0];
    if (!row) throw new Error("Award returned no result");
    return Response.json({ reward: { id: row.reward_id, studentId, points: row.awarded_points, createdAt: row.awarded_at },
      totalPoints: Number(row.total_points) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return handleError(error); }
}
